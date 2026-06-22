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

OCR_SYSTEM_PROMPT = """You are an OCR engine. Your ONLY job is to read handwritten Bengali text from an image.

CRITICAL RULES:
- Read ONLY what is physically written in the image — do NOT use any other knowledge
- Do NOT guess, invent, or use context to fill gaps
- Do NOT look at any questions provided — ignore them completely for transcription
- Transcribe Bengali handwriting exactly as written, character by character
- If an answer section is blank, write: "কোনো উত্তর লেখা হয়নি"
- If handwriting is too messy to read, write: "পাঠযোগ্য নয়"
- Output ONLY valid JSON — no markdown, no explanation

Look for numbered sections (1, 2, 3...) in the image and transcribe each one.

Output format:
{
  "answers": [
    {"question_number": 1, "text": "ONLY what is physically written in the image for section 1"},
    {"question_number": 2, "text": "ONLY what is physically written in the image for section 2"}
  ],
  "total_questions_found": 2,
  "notes": "observation about handwriting quality"
}"""


def build_ocr_prompt(generated_questions: list[dict]) -> str:
    n = len(generated_questions)
    return f"""Read the handwritten Bengali text in this image.

The answer sheet has {n} numbered sections (1 to {n}).
Transcribe EXACTLY what is written in each numbered section.
Do NOT use the questions below to guess answers — read ONLY what is in the image.

Output valid JSON only with the transcribed text for each section."""


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

    # Build lookup: question_number → text (handle both int and string keys)
    answer_map = {}
    for a in answers:
        key = a.get("question_number")
        text = a.get("text", "").strip()
        if key is not None:
            answer_map[int(key)] = text

    # Log what Gemini returned for debugging
    print(f"[ocr] Gemini returned {len(answers)} answers: {list(answer_map.keys())}")
    print(f"[ocr] Expected {len(generated_questions)} questions with ids: {[q['id'] for q in generated_questions]}")

    # ── Save evaluation rows (one per question, answer text only) ─────────────
    source_ids = session.get("source_question_ids", [])

    # Delete any previous incomplete OCR rows for this session
    supabase.table("evaluations").delete().eq("session_id", session_id).execute()

    eval_rows = []
    ocr_results = []

    for i, q in enumerate(generated_questions):
        q_num = q["id"]  # 1-based

        # Try to match by question number, fallback to positional
        student_text = answer_map.get(q_num)
        if student_text is None and i < len(answers):
            # Positional fallback — use i-th answer regardless of number
            student_text = answers[i].get("text", "").strip()
            print(f"[ocr] Q{q_num}: using positional fallback, got: {student_text[:50] if student_text else 'empty'}")
        if not student_text:
            student_text = "কোনো উত্তর লেখা হয়নি"
            print(f"[ocr] Q{q_num}: no answer found")
        else:
            print(f"[ocr] Q{q_num}: found answer: {student_text[:60]}")

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
