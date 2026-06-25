"""
services/evaluation_service.py
================================
Step 5: Sends generated questions + R2 image URL to vision LLM.
Parses per-question scores, Bengali feedback, and model answers.
Stores results in evaluations table and updates exam_session.
"""
import json
from datetime import datetime, timezone
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm
from app.services.r2_service import get_fresh_url_if_expired


# =============================================================================
# PROMPT
# =============================================================================

EVAL_SYSTEM_PROMPT = """You are a Bengali exam evaluator for West Bengal Board students.
Evaluate the handwritten answer sheet shown in the image against the questions provided.

Rules:
- Evaluate ALL questions, even if the answer is blank (awarded = 0 for blank)
- Be encouraging and constructive in feedback — these are school students
- Write feedback and model answers in simple Bengali appropriate for the class level
- Never use double quotes inside Bengali text — use single quotes or Bengali punctuation (।)
- Output ONLY valid JSON — no markdown fences, no explanation

Output format:
{
  "results": [
    {
      "id": 1,
      "awarded": 2,
      "max": 2,
      "feedback": "Bengali feedback here (2-3 encouraging sentences)",
      "model_answer": "Ideal Bengali answer for this class level (3-5 sentences)"
    }
  ],
  "total_awarded": 8,
  "total_max": 20,
  "overall_feedback": "Bengali overall feedback (2-3 sentences)",
  "grade": "B+"
}

Grade scale: A+ (90-100%), A (80-89%), B+ (70-79%), B (60-69%), C (50-59%), D (below 50%)"""


def build_eval_prompt(generated_questions: list[dict], class_number: int) -> str:
    questions_text = "\n\n".join(
        f"Question {q['id']} ({q['marks']} marks):\n{q['question']}"
        for q in generated_questions
    )
    return f"""Evaluate the handwritten answers in the image for Class {class_number} students.

Questions:
{questions_text}

Provide marks awarded, Bengali feedback, and model answer for each question.
Output valid JSON only."""


def clean_llm_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:])
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


def assign_grade(pct: float) -> str:
    if pct >= 90: return "A+"
    if pct >= 80: return "A"
    if pct >= 70: return "B+"
    if pct >= 60: return "B"
    if pct >= 50: return "C"
    return "D"


# =============================================================================
# MAIN EVALUATION PIPELINE
# =============================================================================

def evaluate_session(
    session_id: str,
    user_id: str,
    class_number: int,
    ip_address: str | None = None,
) -> dict:
    """
    Full evaluation pipeline for a submitted exam session.

    1. Load session + generated questions from DB
    2. Get fresh R2 signed URL for the answer image
    3. Call vision LLM with questions + image
    4. Parse results
    5. Store per-question evaluations
    6. Update exam_session with score + grade
    7. Return full result dict

    Returns the complete evaluation result.
    """
    supabase = get_supabase()

    # ── Load session ──────────────────────────────────────────────────────────
    res = (
        supabase.table("exam_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Session not found: {session_id}")

    session = res.data

    if session["completed"]:
        raise ValueError("Session already evaluated")

    if not session.get("answer_image_key"):
        raise ValueError("No answer image uploaded for this session")

    if not session.get("generated_questions"):
        raise ValueError("No generated questions found for this session")

    generated_questions = session["generated_questions"]

    # ── Refresh signed URL if needed ──────────────────────────────────────────
    expires_at = None
    if session.get("answer_image_expires_at"):
        expires_at = datetime.fromisoformat(
            session["answer_image_expires_at"].replace("Z", "+00:00")
        )

    image_url, new_expires_at = get_fresh_url_if_expired(
        object_key=session["answer_image_key"],
        current_url=session.get("answer_image_url", ""),
        expires_at=expires_at or datetime.now(timezone.utc),
    )

    # Update URL in DB if it was refreshed
    if image_url != session.get("answer_image_url"):
        supabase.table("exam_sessions").update({
            "answer_image_url": image_url,
            "answer_image_expires_at": new_expires_at.isoformat(),
        }).eq("id", session_id).execute()

    # ── Call vision LLM ───────────────────────────────────────────────────────
    system_prompt = EVAL_SYSTEM_PROMPT
    user_prompt = build_eval_prompt(generated_questions, class_number)

    raw_response = call_llm(
        purpose="evaluation",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        image_url=image_url,
        session_id=session_id,
        user_id=user_id,
        ip_address=ip_address,
    )

    # ── Parse response ────────────────────────────────────────────────────────
    try:
        cleaned = clean_llm_json(raw_response)
        eval_data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM evaluation returned invalid JSON: {e}\nRaw: {raw_response[:400]}")

    results = eval_data.get("results", [])
    total_awarded = eval_data.get("total_awarded", sum(r.get("awarded", 0) for r in results))
    total_max = eval_data.get("total_max", sum(r.get("max", 0) for r in results))
    overall_feedback = eval_data.get("overall_feedback", "")
    pct = (total_awarded / total_max * 100) if total_max > 0 else 0
    grade = eval_data.get("grade") or assign_grade(pct)

    # ── Store per-question evaluations ────────────────────────────────────────
    # Build source_question lookup: position index → source question id
    source_ids = session.get("source_question_ids", [])

    eval_rows = []
    for i, result in enumerate(results):
        q_index = result["id"] - 1  # LLM uses 1-based IDs
        gen_q = generated_questions[q_index] if q_index < len(generated_questions) else {}

        eval_rows.append({
            "session_id":         session_id,
            "question_index":     q_index,
            "generated_question": gen_q.get("question", ""),
            "source_question_id": source_ids[q_index] if q_index < len(source_ids) else None,
            "marks_awarded":      result.get("awarded", 0),
            "marks_max":          result.get("max", gen_q.get("marks", 0)),
            "feedback":           result.get("feedback", ""),
            "model_answer":       result.get("model_answer", ""),
            "show_answer_requested": False,
        })

    if eval_rows:
        supabase.table("evaluations").insert(eval_rows).execute()

    # ── Update session ────────────────────────────────────────────────────────
    supabase.table("exam_sessions").update({
        "score_awarded":    total_awarded,
        "score_max":        total_max,
        "grade":            grade,
        "overall_feedback": overall_feedback,
        "submitted_at":     datetime.now(timezone.utc).isoformat(),
        "completed":        True,    # triggers chapter_stats update
    }).eq("id", session_id).execute()

    return {
        "session_id":       session_id,
        "score_awarded":    total_awarded,
        "score_max":        total_max,
        "percentage":       round(pct, 1),
        "grade":            grade,
        "overall_feedback": overall_feedback,
        "results":          results,
    }
