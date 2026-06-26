"""
services/question_service.py
============================
Selects questions from the bank by type, builds the two-part exam paper.
No LLM involved — questions are served directly from the DB.

Part 1: mcq, match_pairs, true_false, tap_sequence, categorize  (machine-evaluated)
Part 2: short_write only                                          (OCR + LLM word-match)

GRACEFUL POOL POLICY
--------------------
If a chapter has fewer questions of a given type than the config requests,
we serve all that are available rather than failing. This means:

  - A chapter with only MCQs (e.g. Maths, Vocabulary) produces a smaller
    but fully valid exam — only MCQ questions, no match_pairs/tap_sequence etc.
  - A chapter with just 6 short_write questions produces a 6-question Part 2
    instead of the standard 5 — or fewer if only 3 exist.
  - The only hard failure is when a chapter has ZERO questions of ANY type
    across both parts, which would produce an empty exam (still caught below).
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
    Sample up to `count` questions from pool respecting difficulty percentages.
    If pool is smaller than count, returns the whole pool (no error).
    Falls back to pure random if buckets don't have enough of a difficulty.
    """
    # Cap count to what's actually available
    count = min(count, len(pool))
    if count == 0:
        return []

    if len(pool) == count:
        return pool[:]

    # Split pool by difficulty
    easy   = [q for q in pool if q["difficulty"] == "Easy"]
    medium = [q for q in pool if q["difficulty"] == "Medium"]
    hard   = [q for q in pool if q["difficulty"] == "Hard"]

    # Target counts per difficulty
    n_easy   = round(count * easy_pct   / 100)
    n_medium = round(count * medium_pct / 100)
    n_hard   = count - n_easy - n_medium

    def take(bucket, n):
        n = max(0, min(n, len(bucket)))
        return random.sample(bucket, n) if n > 0 else []

    chosen = take(easy, n_easy) + take(medium, n_medium) + take(hard, n_hard)

    # Fill any gap caused by thin difficulty buckets
    if len(chosen) < count:
        used_ids  = {q["id"] for q in chosen}
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

    Graceful: if a type has fewer questions than config requests, serves
    all available for that type. Raises only if the whole exam would be empty.

    Returns:
        part1_questions: list of selected P1 question dicts (shuffled)
        part2_questions: list of selected P2 short_write dicts (numbered)
        source_ids:      all selected question DB ids
    """
    supabase = get_supabase()

    easy_pct   = config.get("difficulty_easy_pct",   40)
    medium_pct = config.get("difficulty_medium_pct", 40)
    hard_pct   = config.get("difficulty_hard_pct",   20)

    # Part 1 type → requested count from config
    p1_type_counts = {
        "mcq":          config["p1_mcq_count"],
        "match_pairs":  config["p1_match_pairs_count"],
        "true_false":   config["p1_true_false_count"],
        "tap_sequence": config["p1_tap_sequence_count"],
        "categorize":   config["p1_categorize_count"],
    }

    part1: list[dict] = []
    skipped: list[str] = []   # types with zero pool — logged but not fatal

    for q_type, requested in p1_type_counts.items():
        if requested == 0:
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

        pool      = res.data or []
        available = len(pool)

        if available == 0:
            # No questions of this type — skip silently
            skipped.append(q_type)
            continue

        # Serve min(available, requested) — never fail
        serve = min(available, requested)
        chosen = _sample_with_difficulty(pool, serve, easy_pct, medium_pct, hard_pct)
        part1.extend(chosen)

    # Part 2 — short_write
    sw_requested = config["p2_short_write_count"]
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

    sw_pool      = sw_res.data or []
    sw_available = len(sw_pool)
    sw_serve     = min(sw_available, sw_requested)

    part2 = _sample_with_difficulty(sw_pool, sw_serve, easy_pct, medium_pct, hard_pct)

    # Hard failure only if there is literally nothing to serve at all
    if len(part1) == 0 and len(part2) == 0:
        raise RuntimeError(
            f"Chapter {chapter_id} has no active questions in the bank. "
            "Import questions via the admin panel first."
        )

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
        for field in ("options", "pairs", "items", "correct_order", "categories"):
            if isinstance(row.get(field), str):
                try:
                    row[field] = json.loads(row[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        out.append(row)
    return out
