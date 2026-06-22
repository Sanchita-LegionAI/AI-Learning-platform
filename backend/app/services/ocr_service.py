"""
services/ocr_service.py
========================
Step 4a: OCR the uploaded answer image using Gemini 1.5 Flash vision.

Extracts what the student wrote per question, saves to evaluations table.
This is intentionally separate from evaluation — the student can review
their OCR'd text before committing to evaluation.

Flow:
  [Image in R2] → Gemini 1.5 Flash → per-question text → saved to evaluations
"""
import json
from datetime import datetime, timezone
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm
from app.services.r2_service import get_fresh_url_if_expired


# =============================================================================
# PROMPTS
# =============================================================================

OCR_SYSTEM_PROMPT = """You are an OCR engine for Bengali handwritten student answer sheets.
Your ONLY job is to transcribe exactly what the student wrote — do NOT evaluate, correct, or judge.

Rules:
- Read the answer sheet image carefully
- Match each answer to the corresponding question number
- Transcribe the Bengali handwriting as accurately as possible
- If an answer area is blank, write exactly: "কোনো উত্তর লেখা হয়নি"
- If handwriting is unreadable, write: "পাঠযোগ্য নয়"
- Do NOT add, remove, or correct any content
- Do NOT evaluate correctness
- Output ONLY valid JSON — no markdown fences, no explanation

Output format:
{
  "answers": [
    {"question_number": 1, "text": "Exact transcription of student's answer for question 1"},
    {"question_number": 2, "text": "Exact transcription of student's answer for question 2"}
  ],
  "total_questions_found": 2,
  "notes": "Any relevant observation (e.g. some answers missing, messy handwriting)"
}"""


def build_ocr_prompt(generated_questions: list[dict]) -> str:
    question_list = "\n".join(
        f"Question {q['id']} ({q['marks']} marks): {q['question']}"
        for q in generated_questions
    )
    return f"""Transcribe the student's handwritten answers from this answer sheet.

The exam has {len(generated_questions)} questions:
{question_list}

Find and transcribe each answer in order.
Output valid JSON only."""


def clean_llm_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:])
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


# =============================================================================
# MAIN OCR PIPELINE
# =============================================================================

def ocr_session(
    session_id: str,
    user_id: str,
    ip_address: str | None = None,
) -> list[dict]:
    """
    Run OCR on the uploaded answer image for a session.

    1. Load session (needs answer_image_key + generated_questions)
    2. Get fresh signed URL from R2
    3. Call Gemini vision to transcribe answers
    4. Save one evaluation row per question (with student_answer_text)
    5. Mark session ocr_completed = True
    6. Return list of {question_number, question_text, marks, student_answer_text}

    Returns:
        ocr_results: list of per-question OCR dicts for the review screen
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

    if session.get("completed"):
        raise ValueError("Session already evaluated — cannot re-OCR")

    if not session.get("answer_image_key"):
        raise ValueError("No answer image uploaded for this session")

    if not session.get("generated_questions"):
        raise ValueError("No generated questions found for this session")

    generated_questions = session["generated_questions"]

    # ── Refresh R2 signed URL ─────────────────────────────────────────────────
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

    if image_url != session.get("answer_image_url"):
        supabase.table("exam_sessions").update({
            "answer_image_url":        image_url,
            "answer_image_expires_at": new_expires_at.isoformat(),
        }).eq("id", session_id).execute()

    # ── Call Gemini OCR ───────────────────────────────────────────────────────
    raw_response = call_llm(
        purpose="ocr",
        system_prompt=OCR_SYSTEM_PROMPT,
        user_prompt=build_ocr_prompt(generated_questions),
        image_url=image_url,
        session_id=session_id,
        user_id=user_id,
        ip_address=ip_address,
    )

    # ── Parse OCR response ────────────────────────────────────────────────────
    try:
        cleaned  = clean_llm_json(raw_response)
        ocr_data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini OCR returned invalid JSON: {e}\nRaw: {raw_response[:400]}")

    answers = ocr_data.get("answers", [])

    # Build lookup: question_number → text
    answer_map = {a["question_number"]: a.get("text", "") for a in answers}

    # ── Save evaluation rows (one per question, answer text only) ─────────────
    source_ids = session.get("source_question_ids", [])

    # Delete any previous incomplete OCR rows for this session
    supabase.table("evaluations").delete().eq("session_id", session_id).execute()

    eval_rows = []
    ocr_results = []

    for i, q in enumerate(generated_questions):
        q_num = q["id"]  # 1-based
        student_text = answer_map.get(q_num, "কোনো উত্তর লেখা হয়নি")

        eval_rows.append({
            "session_id":           session_id,
            "question_index":       i,
            "generated_question":   q["question"],
            "source_question_id":   source_ids[i] if i < len(source_ids) else None,
            "marks_awarded":        0,      # filled in by evaluation step
            "marks_max":            q["marks"],
            "feedback":             "",     # filled in by evaluation step
            "model_answer":         "",     # filled in by evaluation step
            "student_answer_text":  student_text,
            "show_answer_requested": False,
        })

        ocr_results.append({
            "question_number": q_num,
            "question_text":   q["question"],
            "marks":           q["marks"],
            "student_answer":  student_text,
        })

    if eval_rows:
        supabase.table("evaluations").insert(eval_rows).execute()

    # ── Mark OCR complete on session ──────────────────────────────────────────
    supabase.table("exam_sessions").update({
        "ocr_completed": True,
    }).eq("id", session_id).execute()

    return ocr_results
