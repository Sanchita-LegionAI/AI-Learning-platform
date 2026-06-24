"""
services/ocr_service.py
========================
Part 2 OCR — extracts short written answers (1-3 words) from the answer sheet image.

Key differences from old OCR:
  - Knows exactly how many slots and what each slot's question is
  - Expects 1-3 Bengali words per slot (not paragraphs)
  - Single-word OCR accuracy is much higher than paragraph OCR
  - Student reviews and can correct each slot before evaluation
"""
import json
from datetime import datetime, timezone
from app.core.supabase import get_supabase
from app.services.llm_router import call_llm
from app.services.r2_service import get_fresh_url_if_expired


# =============================================================================
# PROMPTS
# =============================================================================

OCR_SYSTEM_PROMPT = """You are an OCR engine reading a student's handwritten Bengali answer sheet.
The sheet has numbered boxes/lines. Each box contains a SHORT answer — typically 1 to 3 Bengali words.

STRICT RULES:
- Read ONLY what is physically written — never guess or invent
- Transcribe Bengali characters exactly as written
- If a box is blank → set text to ""
- If handwriting is completely illegible → set text to "পাঠযোগ্য নয়"
- Output ONLY valid JSON — no markdown, no explanation

Output format:
{
  "answers": [
    {"slot_id": 1, "text": "থার্মোমিটার"},
    {"slot_id": 2, "text": "জুল"},
    {"slot_id": 3, "text": ""}
  ]
}"""


def _build_ocr_prompt(part2_questions: list[dict]) -> str:
    """Tell Gemini exactly how many slots to look for."""
    slot_lines = "\n".join(
        f"  Slot {q['answer_slot_id']}: answer to '{q['question_bn']}' "
        f"(max {q.get('max_words', 2)} word(s))"
        for q in part2_questions
    )
    return (
        f"This answer sheet has {len(part2_questions)} numbered answer boxes.\n"
        f"Extract the handwritten Bengali text from each box:\n\n"
        f"{slot_lines}\n\n"
        f"Output valid JSON only."
    )


def _clean_llm_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


# =============================================================================
# MAIN OCR PIPELINE
# =============================================================================

def ocr_session(
    session_id: str,
    user_id:    str,
    ip_address: str | None = None,
) -> list[dict]:
    """
    Run slot-based OCR on the uploaded Part 2 answer sheet image.

    1. Load session → part2_questions + image key
    2. Refresh R2 signed URL if needed
    3. Call Gemini vision → extract one text per slot
    4. Return slot results for the review screen (student confirms before eval)

    Returns:
        list of {slot_id, question_bn, max_words, ocr_text}
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
        raise ValueError("Session already completed — cannot re-OCR")
    if not session.get("answer_image_key"):
        raise ValueError("No answer image uploaded — upload the Part 2 answer sheet first")
    if not session.get("part2_questions"):
        raise ValueError("No Part 2 questions found in session")

    part2_questions = session["part2_questions"]

    # ── Refresh signed URL ────────────────────────────────────────────────────
    expires_at = None
    if session.get("answer_image_expires_at"):
        expires_at = datetime.fromisoformat(
            session["answer_image_expires_at"].replace("Z", "+00:00")
        )

    image_url, new_expires_at = get_fresh_url_if_expired(
        object_key  = session["answer_image_key"],
        current_url = session.get("answer_image_url", ""),
        expires_at  = expires_at or datetime.now(timezone.utc),
    )

    if image_url != session.get("answer_image_url"):
        supabase.table("exam_sessions").update({
            "answer_image_url":        image_url,
            "answer_image_expires_at": new_expires_at.isoformat(),
        }).eq("id", session_id).execute()

    # ── Call Gemini OCR ───────────────────────────────────────────────────────
    raw = call_llm(
        purpose       = "ocr",
        system_prompt = OCR_SYSTEM_PROMPT,
        user_prompt   = _build_ocr_prompt(part2_questions),
        image_url     = image_url,
        session_id    = session_id,
        user_id       = user_id,
        ip_address    = ip_address,
    )

    # ── Parse ─────────────────────────────────────────────────────────────────
    try:
        data = json.loads(_clean_llm_json(raw))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini OCR returned invalid JSON: {e}\nRaw: {raw[:400]}")

    # Build slot_id → ocr_text lookup
    ocr_map: dict[int, str] = {}
    for item in (data.get("answers") or []):
        slot = item.get("slot_id")
        text = str(item.get("text") or "").strip()
        if slot is not None:
            ocr_map[int(slot)] = text

    # ── Build review results (one per Part 2 question) ─────────────────────
    ocr_results = []
    for q in part2_questions:
        slot_id  = q["answer_slot_id"]
        ocr_text = ocr_map.get(slot_id, "")   # empty string if Gemini missed it

        ocr_results.append({
            "slot_id":     slot_id,
            "question_bn": q["question_bn"],
            "max_words":   q.get("max_words", 2),
            "ocr_text":    ocr_text,
        })

    print(f"[ocr] Session {session_id}: {len(ocr_results)} slots extracted")

    return ocr_results
