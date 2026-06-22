"""
services/question_service.py
============================
Step 2: Randomly select questions from bank by marks distribution.
Step 3: Either rephrase via LLM OR pass through directly (no LLM, 'none' provider).

When active question_generation provider is 'none':
  - Questions are fetched from the bank as-is
  - question_bn is used directly (no rephrasing)
  - Formatted into the same generated_questions schema
  - Zero LLM cost
"""
import json
import random
from typing import Optional
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm, NoneProviderSignal


# =============================================================================
# STEP 2 — RANDOM QUESTION SELECTION (no LLM)
# =============================================================================

def get_exam_config(config_id: Optional[int] = None) -> dict:
    """
    Fetch exam config. If no config_id, randomly pick from all active configs
    (supports multiple active configs for 4q/5q variety).
    """
    supabase = get_supabase()
    if config_id:
        res = supabase.table("exam_config").select("*").eq("id", config_id).limit(1).execute()
    else:
        res = supabase.table("exam_config").select("*").eq("active", True).execute()

    if not res.data:
        raise RuntimeError("No active exam config found")

    return random.choice(res.data)


def select_questions_from_bank(chapter_id: int, distribution: list[dict]) -> tuple[list[dict], list[int]]:
    """
    Randomly select questions from the question bank per marks distribution.
    distribution = [{"marks": 2, "count": 1}, {"marks": 5, "count": 2}]

    Returns:
        selected_questions: list of question rows
        source_ids: list of question.id integers
    """
    supabase = get_supabase()
    selected_questions = []
    source_ids = []

    for slot in distribution:
        marks = slot["marks"]
        count = slot["count"]

        res = (
            supabase.table("questions")
            .select("id, question_code, question_bn, marks, difficulty, topic_tag, expected_lines")
            .eq("chapter_id", chapter_id)
            .eq("marks", marks)
            .eq("active", True)
            .execute()
        )

        pool = res.data
        if len(pool) < count:
            raise RuntimeError(
                f"Not enough {marks}-mark questions for chapter {chapter_id}. "
                f"Need {count}, found {len(pool)}."
            )

        chosen = random.sample(pool, count)
        selected_questions.extend(chosen)
        source_ids.extend([q["id"] for q in chosen])

    random.shuffle(selected_questions)
    return selected_questions, source_ids


# =============================================================================
# PASSTHROUGH — format bank questions directly (no LLM)
# =============================================================================

def format_passthrough_questions(
    selected_questions: list[dict],
    distribution: list[dict],
) -> list[dict]:
    """
    Format bank questions directly into the generated_questions schema,
    without any LLM rephrasing. Used when provider is 'none'.
    """
    generated = []
    for i, q in enumerate(selected_questions):
        generated.append({
            "id":         i + 1,
            "question":   q["question_bn"],
            "marks":      q["marks"],
            "topic":      q.get("topic_tag") or "",
            "source_ids": [q["question_code"]],
        })
    return generated


# =============================================================================
# STEP 3 — LLM REPHRASING
# =============================================================================

SYSTEM_PROMPT = """You are a Bengali exam question generator for West Bengal Board students.
You receive a set of question stems as a scaffold. Your job is to:
- Rephrase questions naturally — never copy verbatim
- You may merge 2-3 related questions into one richer question
- You may split one question into two simpler parts
- Always maintain the total marks allocation
- Keep language appropriate for the class level
- Output ONLY valid JSON — no markdown, no explanation, no preamble
- CRITICAL: Every question must be written in pure Bengali script only. Do NOT mix English words, letters, or transliteration into Bengali sentences. If a term has no Bengali equivalent, write it in Bengali script (e.g. হেমু, আকবর). Never write Bengali and English mixed in the same sentence.

Output format:
[
  {{
    "id": 1,
    "question": "Bengali question text here",
    "marks": 2,
    "topic": "topic name in Bengali",
    "source_ids": ["CH09_Q001", "CH09_Q003"]
  }}
]"""


def build_rephrase_prompt(
    chapter_name: str,
    subject_name: str,
    class_number: int,
    selected_questions: list[dict],
    distribution: list[dict],
) -> str:
    dist_text = " + ".join(f"{slot['count']}×{slot['marks']}m" for slot in distribution)
    total_marks = sum(slot["marks"] * slot["count"] for slot in distribution)

    stems = "\n".join(
        f"[{q['question_code']}] ({q['marks']} marks, {q['difficulty']}, topic: {q['topic_tag'] or 'general'})\n"
        f"{q['question_bn']}"
        for q in selected_questions
    )

    return f"""Chapter: {chapter_name}
Subject: {subject_name}
Class: {class_number}
Total marks: {total_marks} ({dist_text})

Question stems to rephrase/merge (use as scaffold only):
{stems}

Generate a fresh exam paper. Maintain the same total marks ({total_marks}).
Distribution: {dist_text}
Mix Easy, Medium, and Hard questions.
All questions must be in Bengali.
Output valid JSON array only."""


def clean_llm_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:])
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def generate_exam_paper(
    chapter_id: int,
    chapter_name: str,
    subject_name: str,
    class_number: int,
    session_id: str,
    user_id: str,
    ip_address: Optional[str] = None,
    config_id: Optional[int] = None,
) -> tuple[list[dict], list[int], int]:
    """
    Full exam paper generation pipeline.

    Returns:
        generated_questions: list of question dicts (LLM-rephrased OR passthrough)
        source_ids: original bank question IDs used as scaffold
        exam_config_id: config used
    """
    config = get_exam_config(config_id)
    distribution = config["distribution"]

    selected_questions, source_ids = select_questions_from_bank(chapter_id, distribution)

    # Try LLM rephrasing — fall back to passthrough if provider is 'none'
    try:
        raw_response = call_llm(
            purpose="question_generation",
            system_prompt=SYSTEM_PROMPT,
            user_prompt=build_rephrase_prompt(
                chapter_name=chapter_name,
                subject_name=subject_name,
                class_number=class_number,
                selected_questions=selected_questions,
                distribution=distribution,
            ),
            session_id=session_id,
            user_id=user_id,
            ip_address=ip_address,
        )

        cleaned = clean_llm_json(raw_response)
        generated_questions = json.loads(cleaned)
        if not isinstance(generated_questions, list):
            raise ValueError("LLM response is not a JSON array")

    except NoneProviderSignal:
        # 'none' provider active — use bank questions directly
        generated_questions = format_passthrough_questions(selected_questions, distribution)

    except (json.JSONDecodeError, ValueError) as e:
        raise RuntimeError(f"LLM returned invalid JSON: {e}")

    return generated_questions, source_ids, config["id"]
