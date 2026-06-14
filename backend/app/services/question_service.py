"""
services/question_service.py
============================
Step 2: Program randomly selects questions from bank by marks distribution.
Step 3: Selected stems sent to LLM to rephrase/merge into fresh exam paper.
"""
import json
import random
from typing import Optional
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm


# =============================================================================
# STEP 2 — RANDOM QUESTION SELECTION (no LLM)
# =============================================================================

def get_exam_config(config_id: Optional[int] = None) -> dict:
    """Fetch active exam config (marks distribution)."""
    supabase = get_supabase()
    query = supabase.table("exam_config").select("*")
    if config_id:
        query = query.eq("id", config_id)
    else:
        query = query.eq("active", True)
    res = query.limit(1).execute()
    if not res.data:
        raise RuntimeError("No active exam config found")
    return res.data[0]


def select_questions_from_bank(chapter_id: int, distribution: list[dict]) -> tuple[list[dict], list[int]]:
    """
    Randomly select questions from the question bank per marks distribution.
    distribution = [{"marks": 2, "count": 3}, {"marks": 3, "count": 2}, {"marks": 5, "count": 2}]

    Returns:
        selected_questions: list of question rows (for LLM prompt)
        source_ids: list of question.id integers (stored in exam_sessions)
    """
    supabase = get_supabase()
    selected_questions = []
    source_ids = []

    for slot in distribution:
        marks = slot["marks"]
        count = slot["count"]

        # Fetch all active questions of this marks type for the chapter
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
                f"Need {count}, found {len(pool)}. "
                f"Run seed_questions.py to import more questions."
            )

        # Random sample without replacement
        chosen = random.sample(pool, count)
        selected_questions.extend(chosen)
        source_ids.extend([q["id"] for q in chosen])

    # Shuffle final list so marks aren't grouped predictably
    random.shuffle(selected_questions)
    return selected_questions, source_ids


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
    """Build the user prompt for question rephrasing."""
    # Summarise the distribution
    dist_text = " + ".join(
        f"{slot['count']}×{slot['marks']}m" for slot in distribution
    )
    total_marks = sum(slot["marks"] * slot["count"] for slot in distribution)

    # Format question stems
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
    """Strip markdown fences if LLM adds them despite instructions."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:])
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


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
        generated_questions: list of LLM-rephrased question dicts
        source_ids: original bank question IDs used as scaffold
        exam_config_id: config used
    """
    # Load distribution config
    config = get_exam_config(config_id)
    distribution = config["distribution"]  # list of {"marks": int, "count": int}

    # Step 2: Program randomly selects from bank
    selected_questions, source_ids = select_questions_from_bank(chapter_id, distribution)

    # Step 3: LLM rephrases
    system = SYSTEM_PROMPT
    user = build_rephrase_prompt(
        chapter_name=chapter_name,
        subject_name=subject_name,
        class_number=class_number,
        selected_questions=selected_questions,
        distribution=distribution,
    )

    raw_response = call_llm(
        purpose="question_generation",
        system_prompt=system,
        user_prompt=user,
        session_id=session_id,
        user_id=user_id,
        ip_address=ip_address,
    )

    # Parse JSON response
    try:
        cleaned = clean_llm_json(raw_response)
        generated_questions = json.loads(cleaned)
        if not isinstance(generated_questions, list):
            raise ValueError("LLM response is not a JSON array")
    except (json.JSONDecodeError, ValueError) as e:
        raise RuntimeError(f"LLM returned invalid JSON: {e}\nRaw: {raw_response[:300]}")

    return generated_questions, source_ids, config["id"]
