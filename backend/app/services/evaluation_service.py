"""
services/evaluation_service.py
================================
Step 4b: Evaluate answers using the OCR'd text stored in evaluations table.

NO image is sent to the LLM — only the questions and the student's transcribed text.
This is more accurate, cheaper, and faster than vision evaluation.

Flow:
  [OCR text in evaluations table] + [questions] → GPT-4.1 Nano → scores + feedback
"""
import json
from datetime import datetime, timezone
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm


# =============================================================================
# PROMPTS
# =============================================================================

EVAL_SYSTEM_PROMPT = """You are a Bengali exam evaluator for West Bengal Board students.
You will be given the exam questions and the student's transcribed answers (from OCR).
Evaluate each answer and provide marks, feedback, and model answer.

Rules:
- Award marks strictly based on correctness and completeness
- If the student answer is "কোনো উত্তর লেখা হয়নি" or blank → awarded = 0
- If the answer is completely off-topic or wrong subject → awarded = 0, explain clearly
- Be encouraging and constructive — these are school students
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
  "total_max": 17,
  "overall_feedback": "Bengali overall feedback (2-3 sentences)",
  "grade": "B+"
}

Grade scale: A+ (90-100%), A (80-89%), B+ (70-79%), B (60-69%), C (50-59%), D (below 50%)"""


def build_eval_prompt(generated_questions: list[dict], ocr_answers: list[dict], class_number: int) -> str:
    """Build prompt with questions paired with student's OCR'd answers."""
    lines = [f"Evaluate these {len(generated_questions)} answers for Class {class_number}:\n"]

    for i, q in enumerate(generated_questions):
        q_num = q["id"]
        student_text = ""
        # Match by question index
        if i < len(ocr_answers):
            student_text = ocr_answers[i].get("student_answer_text", "কোনো উত্তর লেখা হয়নি")

        lines.append(
            f"Question {q_num} ({q['marks']} marks):\n"
            f"  Q: {q['question']}\n"
            f"  Student answer: {student_text or 'কোনো উত্তর লেখা হয়নি'}\n"
        )

    lines.append("\nProvide marks awarded, Bengali feedback, and model answer for each question.")
    lines.append("Output valid JSON only.")
    return "\n".join(lines)


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
    Evaluate a session using the OCR'd answers already stored in evaluations table.

    1. Load session + generated questions
    2. Load OCR'd answers from evaluations table
    3. Call text-only LLM with questions + answers
    4. Update each evaluation row with marks + feedback
    5. Update exam_session with score + grade
    6. Return full result dict
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

    if not session.get("ocr_completed"):
        raise ValueError("OCR not completed for this session — run /ocr first")

    if not session.get("generated_questions"):
        raise ValueError("No generated questions found for this session")

    generated_questions = session["generated_questions"]

    # ── Load OCR'd answers from evaluations ───────────────────────────────────
    eval_res = (
        supabase.table("evaluations")
        .select("*")
        .eq("session_id", session_id)
        .order("question_index")
        .execute()
    )

    ocr_answers = eval_res.data or []

    if not ocr_answers:
        raise ValueError("No OCR answers found — run /ocr first")

    # ── Call text-only LLM (no image) ─────────────────────────────────────────
    raw_response = call_llm(
        purpose="evaluation",
        system_prompt=EVAL_SYSTEM_PROMPT,
        user_prompt=build_eval_prompt(generated_questions, ocr_answers, class_number),
        image_url=None,  # text-only — no image needed
        session_id=session_id,
        user_id=user_id,
        ip_address=ip_address,
    )

    # ── Parse response ────────────────────────────────────────────────────────
    try:
        cleaned   = clean_llm_json(raw_response)
        eval_data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM evaluation returned invalid JSON: {e}\nRaw: {raw_response[:400]}")

    results        = eval_data.get("results", [])
    total_awarded  = eval_data.get("total_awarded", sum(r.get("awarded", 0) for r in results))
    total_max      = eval_data.get("total_max",     sum(r.get("max", 0)     for r in results))
    overall_feedback = eval_data.get("overall_feedback", "")
    pct   = (total_awarded / total_max * 100) if total_max > 0 else 0
    grade = eval_data.get("grade") or assign_grade(pct)

    # ── Update evaluation rows with marks + feedback ──────────────────────────
    for result in results:
        q_index = result["id"] - 1  # LLM uses 1-based IDs
        if q_index < len(ocr_answers):
            row = ocr_answers[q_index]
            supabase.table("evaluations").update({
                "marks_awarded": result.get("awarded", 0),
                "marks_max":     result.get("max", row.get("marks_max", 0)),
                "feedback":      result.get("feedback", ""),
                "model_answer":  result.get("model_answer", ""),
            }).eq("id", row["id"]).execute()

    # ── Update session ────────────────────────────────────────────────────────
    supabase.table("exam_sessions").update({
        "score_awarded":    total_awarded,
        "score_max":        total_max,
        "grade":            grade,
        "overall_feedback": overall_feedback,
        "submitted_at":     datetime.now(timezone.utc).isoformat(),
        "completed":        True,
    }).eq("id", session_id).execute()

    return {
        "session_id":          session_id,
        "score_awarded":       total_awarded,
        "score_max":           total_max,
        "percentage":          round(pct, 1),
        "grade":               grade,
        "overall_feedback":    overall_feedback,
        "results":             results,
        "generated_questions": generated_questions,
        "ocr_answers":         ocr_answers,
    }
