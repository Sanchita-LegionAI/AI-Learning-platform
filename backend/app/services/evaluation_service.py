"""
services/evaluation_service.py
================================
Part 2 evaluation — LLM word-match for short_write answers.

Flow:
  confirmed OCR answers (1-3 words each)
  → GPT-4.1 Nano text-only call
  → per-slot marks + Bengali feedback
  → update evaluations table
  → update session with part2 + overall scores
"""
import json
from datetime import datetime, timezone
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm


# =============================================================================
# PROMPTS
# =============================================================================

EVAL_SYSTEM_PROMPT = """তুমি পশ্চিমবঙ্গ বোর্ডের সপ্তম শ্রেণীর পরীক্ষার মূল্যায়নকারী।
প্রতিটি প্রশ্নের জন্য ছাত্রের উত্তর (১-৩টি শব্দ) সঠিক উত্তরের সাথে মিলিয়ে দেখো।

নিয়মাবলী:
- সম্পূর্ণ মিল বা গ্রহণযোগ্য প্রতিশব্দ হলে পূর্ণ নম্বর দাও
- ছোট বানান ভুল উপেক্ষা করো (যেমন: থারমোমিটার = থার্মোমিটার)
- ফাঁকা বা অপ্রাসঙ্গিক উত্তরে ০ দাও
- প্রতিটি প্রশ্নের জন্য ২-৩ বাক্যে বাংলায় উৎসাহমূলক মন্তব্য লেখো
- Output ONLY valid JSON — no markdown, no explanation

Output format:
{
  "results": [
    {
      "slot_id": 1,
      "marks_awarded": 2,
      "marks_max": 2,
      "is_correct": true,
      "feedback_bn": "বাংলায় ২-৩ বাক্যের মন্তব্য"
    }
  ],
  "total_awarded": 8,
  "total_max": 10,
  "overall_feedback_bn": "সামগ্রিক উৎসাহমূলক মন্তব্য"
}"""


def _build_eval_prompt(part2_questions: list[dict], confirmed_answers: dict) -> str:
    """
    Build evaluation prompt pairing each question with the student's confirmed OCR answer.
    confirmed_answers: {slot_id (str or int): ocr_text}
    """
    lines = [f"নিচের {len(part2_questions)}টি প্রশ্নের উত্তর মূল্যায়ন করো:\n"]

    for q in part2_questions:
        slot_id     = q["answer_slot_id"]
        student_ans = (confirmed_answers.get(str(slot_id)) or
                       confirmed_answers.get(int(slot_id)) or
                       "কোনো উত্তর লেখা হয়নি")
        student_ans = str(student_ans).strip() or "কোনো উত্তর লেখা হয়নি"

        lines.append(
            f"প্রশ্ন {slot_id} ({q['marks']} নম্বর):\n"
            f"  প্রশ্ন: {q['question_bn']}\n"
            f"  সঠিক উত্তর: {q.get('expected_answer', '')}\n"
            f"  ছাত্রের উত্তর: {student_ans}\n"
        )

    lines.append("\nOnly output valid JSON.")
    return "\n".join(lines)


def _clean_llm_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


def _assign_grade(pct: float) -> str:
    if pct >= 90: return "A+"
    if pct >= 80: return "A"
    if pct >= 70: return "B+"
    if pct >= 60: return "B"
    if pct >= 50: return "C"
    return "D"


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def evaluate_part2(
    session_id:         str,
    user_id:            str,
    confirmed_answers:  dict,   # {slot_id: ocr_text} — student-confirmed
    ip_address:         str | None = None,
) -> dict:
    """
    Evaluate Part 2 (short_write) answers using LLM word-match.

    Args:
        session_id:        UUID of the exam session
        user_id:           UUID of the student
        confirmed_answers: student-confirmed OCR answers {slot_id: text}
        ip_address:        for cost logging

    Returns dict with part2 scores + combined overall scores.
    """
    supabase = get_supabase()

    # ── Load session ──────────────────────────────────────────────────────────
    res = (
        supabase.table("exam_sessions")
        .select("*")
        .eq("id",      session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Session not found: {session_id}")

    session = res.data

    if session.get("completed"):
        raise ValueError("Session already completed")
    if not session.get("part1_completed"):
        raise ValueError("Part 1 not completed yet")

    part2_questions = session.get("part2_questions") or []
    if not part2_questions:
        raise ValueError("No Part 2 questions found in session")

    # ── Call LLM ──────────────────────────────────────────────────────────────
    raw = call_llm(
        purpose       = "evaluation",
        system_prompt = EVAL_SYSTEM_PROMPT,
        user_prompt   = _build_eval_prompt(part2_questions, confirmed_answers),
        image_url     = None,
        session_id    = session_id,
        user_id       = user_id,
        ip_address    = ip_address,
    )

    # ── Parse ─────────────────────────────────────────────────────────────────
    try:
        data = json.loads(_clean_llm_json(raw))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM returned invalid JSON: {e}\nRaw: {raw[:400]}")

    results          = data.get("results", [])
    overall_feedback = data.get("overall_feedback_bn", "")

    # ── Save evaluation rows ──────────────────────────────────────────────────
    # Delete any stale part2 evaluation rows first
    supabase.table("evaluations").delete()\
        .eq("session_id", session_id)\
        .eq("q_part", "part2")\
        .execute()

    slot_result_map = {r["slot_id"]: r for r in results}
    p2_awarded = 0.0
    p2_max     = 0.0
    eval_rows  = []

    for i, q in enumerate(part2_questions):
        slot_id     = q["answer_slot_id"]
        result      = slot_result_map.get(slot_id, {})
        marks_max   = float(q["marks"])
        student_ans = (
            confirmed_answers.get(str(slot_id)) or
            confirmed_answers.get(int(slot_id)) or
            "কোনো উত্তর লেখা হয়নি"
        )

        # Hard-enforce zero for blank answers regardless of LLM
        awarded = float(result.get("marks_awarded", 0))
        if not str(student_ans).strip() or student_ans == "কোনো উত্তর লেখা হয়নি":
            awarded = 0.0

        awarded = min(awarded, marks_max)  # never exceed max

        p2_awarded += awarded
        p2_max     += marks_max

        eval_rows.append({
            "session_id":     session_id,
            "question_index": i,
            "q_type":         "short_write",
            "q_part":         "part2",
            "question_bn":    q["question_bn"],
            "student_answer": str(student_ans),
            "correct_answer": q.get("expected_answer", ""),
            "marks_awarded":  awarded,
            "marks_max":      marks_max,
            "is_correct":     awarded == marks_max,
            "feedback_bn":    result.get("feedback_bn", ""),
        })

    if eval_rows:
        supabase.table("evaluations").insert(eval_rows).execute()

    # ── Combine Part 1 + Part 2 scores ───────────────────────────────────────
    p1_awarded = float(session.get("part1_score_awarded") or 0)
    p1_max     = float(session.get("part1_score_max")     or 0)

    total_awarded = p1_awarded + p2_awarded
    total_max     = p1_max     + p2_max
    pct           = round((total_awarded / total_max * 100) if total_max > 0 else 0, 1)
    grade         = _assign_grade(pct)

    # ── Update session ────────────────────────────────────────────────────────
    supabase.table("exam_sessions").update({
        "part2_ocr_answers":   confirmed_answers,
        "part2_score_awarded": p2_awarded,
        "part2_score_max":     p2_max,
        "part2_completed":     True,
        "score_awarded":       total_awarded,
        "score_max":           total_max,
        "grade":               grade,
        "submitted_at":        datetime.now(timezone.utc).isoformat(),
        "completed":           True,
    }).eq("id", session_id).execute()

    return {
        "session_id":          session_id,
        "part2_score_awarded": p2_awarded,
        "part2_score_max":     p2_max,
        "total_score_awarded": total_awarded,
        "total_score_max":     total_max,
        "percentage":          pct,
        "grade":               grade,
        "overall_feedback_bn": overall_feedback,
        "results":             eval_rows,
    }
