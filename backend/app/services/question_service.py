"""
services/question_service.py
============================
Selects questions from the bank by type, builds the two-part exam paper.
No LLM involved — questions are served directly from the DB.

Part 1: mcq, match_pairs, true_false, tap_sequence, categorize  (machine-evaluated)
Part 2: short_write only                                          (OCR + LLM word-match)
"""
import json
import random
from typing import Optional
from app.core.supabase import get_supabase


# Marks per question type — must match DB values
MARKS_PER_TYPE = {
    "mcq":          1,
    "match_pairs":  2,
    "true_false":   1,
    "tap_sequence": 2,
    "categorize":   2,
    "short_write":  2,
}


# =============================================================================
# CONFIG
# =============================================================================

def get_exam_config(config_id: Optional[int] = None) -> dict:
    """Fetch exam config. If no config_id, uses the active one."""
    supabase = get_supabase()
    if config_id:
        res = (
            supabase.table("exam_config")
            .select("*")
            .eq("id", config_id)
            .single()
            .execute()
        )
    else:
        res = (
            supabase.table("exam_config")
            .select("*")
            .eq("active", True)
            .limit(1)
            .execute()
        )

    if not res.data:
        raise RuntimeError("No active exam config found — activate one in the admin panel")

    # .single() returns a dict; .execute() with limit returns a list
    return res.data if isinstance(res.data, dict) else res.data[0]


# =============================================================================
# QUESTION SELECTION
# =============================================================================

def _sample_with_difficulty(
    pool: list[dict],
    count: int,
    easy_pct: int,
    medium_pct: int,
    hard_pct: int,
) -> list[dict]:
    """
    Sample `count` questions from pool respecting difficulty percentages.
    Falls back to pure random if the pool doesn't have enough of a difficulty.
    """
    if len(pool) <= count:
        return pool[:]

    # Split pool by difficulty
    easy   = [q for q in pool if q["difficulty"] == "Easy"]
    medium = [q for q in pool if q["difficulty"] == "Medium"]
    hard   = [q for q in pool if q["difficulty"] == "Hard"]

    # Target counts per difficulty
    n_easy   = round(count * easy_pct   / 100)
    n_medium = round(count * medium_pct / 100)
    n_hard   = count - n_easy - n_medium   # remainder goes to hard

    chosen = []

    # Sample each bucket, capping at available
    def take(bucket, n):
        n = max(0, min(n, len(bucket)))
        return random.sample(bucket, n) if n > 0 else []

    chosen += take(easy,   n_easy)
    chosen += take(medium, n_medium)
    chosen += take(hard,   n_hard)

    # If we're short (buckets too small), fill from remainder
    if len(chosen) < count:
        used_ids = {q["id"] for q in chosen}
        remainder = [q for q in pool if q["id"] not in used_ids]
        still_need = count - len(chosen)
        chosen += random.sample(remainder, min(still_need, len(remainder)))

    return chosen


def select_questions_for_exam(
    chapter_id: int,
    config: dict,
) -> tuple[list[dict], list[dict], list[int]]:
    """
    Select Part 1 and Part 2 questions from the bank for this chapter.

    Returns:
        part1_questions: list of selected P1 question dicts (shuffled)
        part2_questions: list of selected P2 short_write dicts (numbered)
        source_ids:      all selected question DB ids (for session logging)
    """
    supabase = get_supabase()

    easy_pct   = config.get("difficulty_easy_pct",   40)
    medium_pct = config.get("difficulty_medium_pct", 40)
    hard_pct   = config.get("difficulty_hard_pct",   20)

    # Part 1 type → count mapping
    p1_type_counts = {
        "mcq":          config["p1_mcq_count"],
        "match_pairs":  config["p1_match_pairs_count"],
        "true_false":   config["p1_true_false_count"],
        "tap_sequence": config["p1_tap_sequence_count"],
        "categorize":   config["p1_categorize_count"],
    }

    part1: list[dict] = []

    for q_type, count in p1_type_counts.items():
        if count == 0:
            continue

        res = (
            supabase.table("questions")
            .select(
                "id, question_code, q_type, q_part, marks, marks_per_item, "
                "difficulty, topic_bn, question_bn, "
                "options, correct_answer, pairs, items, correct_order, categories"
            )
            .eq("chapter_id", chapter_id)
            .eq("q_type",     q_type)
            .eq("q_part",     "part1")
            .eq("active",     True)
            .execute()
        )

        pool = res.data or []
        if len(pool) < count:
            raise RuntimeError(
                f"Not enough '{q_type}' questions for chapter {chapter_id}. "
                f"Need {count}, found {len(pool)}."
            )

        chosen = _sample_with_difficulty(pool, count, easy_pct, medium_pct, hard_pct)
        part1.extend(chosen)

    # Part 2 — short_write
    sw_count = config["p2_short_write_count"]
    sw_res = (
        supabase.table("questions")
        .select(
            "id, question_code, q_type, q_part, marks, "
            "difficulty, topic_bn, question_bn, "
            "expected_answer, max_words, answer_slot_id"
        )
        .eq("chapter_id", chapter_id)
        .eq("q_type",     "short_write")
        .eq("q_part",     "part2")
        .eq("active",     True)
        .execute()
    )

    sw_pool = sw_res.data or []
    if len(sw_pool) < sw_count:
        raise RuntimeError(
            f"Not enough 'short_write' questions for chapter {chapter_id}. "
            f"Need {sw_count}, found {len(sw_pool)}."
        )

    part2 = _sample_with_difficulty(sw_pool, sw_count, easy_pct, medium_pct, hard_pct)

    # Renumber answer_slot_id sequentially (1..N) for this session's answer sheet
    for i, q in enumerate(part2):
        q["answer_slot_id"] = i + 1

    random.shuffle(part1)
    source_ids = [q["id"] for q in part1 + part2]

    return part1, part2, source_ids


# =============================================================================
# SERIALISE FOR SESSION STORAGE
# =============================================================================

def serialise_questions(questions: list[dict]) -> list[dict]:
    """
    Ensure JSONB fields (returned as dicts/lists by supabase-py) are
    JSON-serialisable. Supabase-py already deserialises JSONB → Python
    objects, so this is mostly a safety pass.
    """
    out = []
    for q in questions:
        row = dict(q)
        # These should already be Python objects from supabase-py,
        # but guard against raw strings just in case.
        for field in ("options", "pairs", "items", "correct_order", "categories"):
            if isinstance(row.get(field), str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        out.append(row)
    return out
