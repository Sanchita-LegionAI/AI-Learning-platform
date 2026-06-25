"""
routers/exam.py
================
POST /api/exam/generate              — select questions, create session
POST /api/exam/submit-part1          — evaluate Part 1 server-side (no LLM)
POST /api/exam/upload-answer         — upload Part 2 answer sheet image to R2
POST /api/exam/ocr                   — OCR the answer sheet (slot-based)
POST /api/exam/submit-ocr-answers    — student confirms OCR text
POST /api/exam/evaluate-part2        — LLM word-match evaluation for Part 2
GET  /api/exam/session/{id}          — full session result
GET  /api/exam/my-sessions           — student's session history
DELETE /api/exam/session/{id}        — delete a pending session
"""
import base64
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.core.auth import get_current_user, require_student
from app.core.supabase import get_supabase
from app.core.config import get_settings
from app.services.question_service import (
    get_exam_config, select_questions_for_exam, serialise_questions
)
from app.services.part1_evaluator import evaluate_part1
from app.services.ocr_service import ocr_session
from app.services.evaluation_service import evaluate_part2
from app.services.r2_service import upload_answer_image

router = APIRouter(prefix="/api/exam", tags=["exam"])


# =============================================================================
# HELPERS
# =============================================================================

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


def _check_daily_limit(user_id: str) -> bool:
    settings = get_settings()
    supabase = get_supabase()
    res = supabase.rpc(
        "increment_daily_usage",
        {"p_user_id": user_id, "p_limit": settings.DAILY_EXAM_LIMIT}
    ).execute()
    raw = res.data
    if isinstance(raw, list):
        raw = raw[0] if raw else False
    return raw is True or raw == True


def _get_chapter_context(chapter_id: int) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("chapters")
        .select(
            "id, name_bn, chapter_number, "
            "books!inner(book_id_code, title_bn, "
            "subjects!inner(name, display_name_bn, "
            "classes!inner(name)))"
        )
        .eq("id", chapter_id)
        .eq("active", True)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Chapter not found or inactive")
    return res.data


# =============================================================================
# REQUEST MODELS
# =============================================================================

class GenerateRequest(BaseModel):
    chapter_id: int
    config_id:  Optional[int] = None


class SubmitPart1Request(BaseModel):
    session_id: str
    answers:    dict   # {str(question_db_id): answer_value}


class UploadAnswerRequest(BaseModel):
    session_id:   str
    image_base64: str
    content_type: str = "image/jpeg"


class OcrRequest(BaseModel):
    session_id: str


class SubmitOcrRequest(BaseModel):
    session_id:         str
    confirmed_answers:  dict   # {slot_id: ocr_text} — after student review


class EvaluatePart2Request(BaseModel):
    session_id: str


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/generate")
def generate_exam(
    body:    GenerateRequest,
    request: Request,
    user:    dict = Depends(require_student),
):
    """
    Create a new exam session.
    Selects Part 1 and Part 2 questions from the bank (no LLM).
    Returns both question sets to the frontend.
    """
    user_id = user["user_id"]

    if not _check_daily_limit(user_id):
        settings = get_settings()
        raise HTTPException(
            status_code=429,
            detail={
                "message_bn": "আজকের পরীক্ষার সীমা শেষ হয়েছে। কাল আবার এসো!",
                "message_en": f"Daily limit of {settings.DAILY_EXAM_LIMIT} exams reached.",
            },
        )

    chapter = _get_chapter_context(body.chapter_id)
    book    = chapter["books"]
    subject = book["subjects"]

    supabase = get_supabase()
    config   = get_exam_config(body.config_id)

    part1_qs, part2_qs, source_ids = select_questions_for_exam(
        chapter_id = body.chapter_id,
        config     = config,
    )

    part1_qs = serialise_questions(part1_qs)
    part2_qs = serialise_questions(part2_qs)

    # Compute marks totals
    p1_max = sum(float(q["marks"]) for q in part1_qs)
    p2_max = sum(float(q["marks"]) for q in part2_qs)

    # Create session
    res = supabase.table("exam_sessions").insert({
        "user_id":          user_id,
        "chapter_id":       body.chapter_id,
        "exam_config_id":   config["id"],
        "part1_questions":  part1_qs,
        "part2_questions":  part2_qs,
        "part1_score_max":  p1_max,
        "part2_score_max":  p2_max,
        "score_max":        p1_max + p2_max,
        "schema_version":   4,
    }).execute()

    session_id = res.data[0]["id"]

    return {
        "session_id":       session_id,
        "chapter_name":     chapter["name_bn"],
        "subject":          subject["display_name_bn"],
        "config_name":      config["config_name"],
        "part1_questions":  part1_qs,
        "part2_questions":  part2_qs,
        "part1_max_marks":  p1_max,
        "part2_max_marks":  p2_max,
        "total_max_marks":  p1_max + p2_max,
    }


@router.post("/submit-part1")
def submit_part1(
    body: SubmitPart1Request,
    user: dict = Depends(require_student),
):
    """
    Evaluate all Part 1 answers server-side — no LLM, instant results.
    Stores scores in session and returns per-question breakdown.
    """
    user_id  = user["user_id"]
    supabase = get_supabase()

    # Load session
    res = (
        supabase.table("exam_sessions")
        .select("id, part1_questions, part1_completed, completed")
        .eq("id",      body.session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = res.data
    if session["completed"]:
        raise HTTPException(status_code=400, detail="Session already completed")
    if session["part1_completed"]:
        raise HTTPException(status_code=400, detail="Part 1 already submitted")

    part1_questions = session["part1_questions"] or []
    if not part1_questions:
        raise HTTPException(status_code=400, detail="No Part 1 questions in session")

    # Evaluate
    evaluation = evaluate_part1(part1_questions, body.answers)

    # Save evaluation rows (one per question)
    eval_rows = []
    for i, r in enumerate(evaluation["results"]):
        eval_rows.append({
            "session_id":     body.session_id,
            "question_index": i,
            "q_type":         r["q_type"],
            "q_part":         "part1",
            "question_bn":    r["question_bn"],
            "student_answer": str(r["student_answer"]) if r["student_answer"] is not None else "",
            "correct_answer": str(r["correct_answer"]) if r["correct_answer"] is not None else "",
            "marks_awarded":  r["marks_awarded"],
            "marks_max":      r["marks_max"],
            "is_correct":     r["is_correct"],
        })

    if eval_rows:
        supabase.table("evaluations").insert(eval_rows).execute()

    # Update session
    supabase.table("exam_sessions").update({
        "part1_answers":      body.answers,
        "part1_score_awarded": evaluation["score_awarded"],
        "part1_score_max":     evaluation["score_max"],
        "part1_completed":     True,
    }).eq("id", body.session_id).execute()

    return {
        "session_id":     body.session_id,
        "score_awarded":  evaluation["score_awarded"],
        "score_max":      evaluation["score_max"],
        "percentage":     evaluation["percentage"],
        "grade":          evaluation["grade"],
        "results":        evaluation["results"],
    }


@router.post("/upload-answer")
def upload_answer(
    body: UploadAnswerRequest,
    user: dict = Depends(require_student),
):
    """Upload the Part 2 handwritten answer sheet image to R2."""
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select("id, completed, part1_completed, answer_image_key")
        .eq("id",      body.session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = res.data
    if session["completed"]:
        raise HTTPException(status_code=400, detail="Session already completed")
    if not session["part1_completed"]:
        raise HTTPException(status_code=400, detail="Complete Part 1 before uploading Part 2 image")
    if session.get("answer_image_key"):
        raise HTTPException(status_code=400, detail="Answer image already uploaded")

    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    try:
        object_key, signed_url, expires_at = upload_answer_image(
            session_id   = body.session_id,
            user_id      = user_id,
            image_bytes  = image_bytes,
            content_type = body.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {e}")

    supabase.table("exam_sessions").update({
        "answer_image_key":        object_key,
        "answer_image_url":        signed_url,
        "answer_image_expires_at": expires_at.isoformat(),
    }).eq("id", body.session_id).execute()

    return {
        "session_id":  body.session_id,
        "uploaded":    True,
        "preview_url": signed_url,
    }


@router.post("/ocr")
def run_ocr(
    body:    OcrRequest,
    request: Request,
    user:    dict = Depends(require_student),
):
    """
    Run slot-based OCR on the Part 2 answer sheet.
    Returns per-slot OCR text for student to review before evaluation.
    """
    user_id = user["user_id"]
    ip      = _get_client_ip(request)

    try:
        ocr_results = ocr_session(
            session_id = body.session_id,
            user_id    = user_id,
            ip_address = ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"session_id": body.session_id, "ocr_results": ocr_results}


@router.post("/submit-ocr-answers")
def submit_ocr_answers(
    body: SubmitOcrRequest,
    user: dict = Depends(require_student),
):
    """
    Store the student's confirmed (possibly edited) OCR answers.
    Called after the student reviews the OCR review screen.
    """
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select("id, completed, part1_completed")
        .eq("id",      body.session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if res.data["completed"]:
        raise HTTPException(status_code=400, detail="Session already completed")
    if not res.data["part1_completed"]:
        raise HTTPException(status_code=400, detail="Part 1 not completed")

    supabase.table("exam_sessions").update({
        "part2_ocr_answers": body.confirmed_answers,
    }).eq("id", body.session_id).execute()

    return {"session_id": body.session_id, "saved": True}


@router.post("/evaluate-part2")
def evaluate_part2_endpoint(
    body:    EvaluatePart2Request,
    request: Request,
    user:    dict = Depends(require_student),
):
    """
    LLM word-match evaluation for Part 2 short_write answers.
    Uses confirmed_answers already stored in the session.
    """
    user_id  = user["user_id"]
    ip       = _get_client_ip(request)
    supabase = get_supabase()

    # Load confirmed answers from session
    res = (
        supabase.table("exam_sessions")
        .select("part2_ocr_answers, part1_completed, completed")
        .eq("id",      body.session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = res.data
    if session["completed"]:
        raise HTTPException(status_code=400, detail="Session already completed")
    if not session["part1_completed"]:
        raise HTTPException(status_code=400, detail="Part 1 not completed")

    confirmed = session.get("part2_ocr_answers") or {}
    if not confirmed:
        raise HTTPException(
            status_code=400,
            detail="No confirmed OCR answers found — complete OCR review first"
        )

    try:
        result = evaluate_part2(
            session_id        = body.session_id,
            user_id           = user_id,
            confirmed_answers = confirmed,
            ip_address        = ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result


@router.get("/session/{session_id}")
def get_session(
    session_id: str,
    user:       dict = Depends(require_student),
):
    """Full session result including Part 1 and Part 2 evaluations."""
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select("*")
        .eq("id",      session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = res.data

    # Fetch evaluations split by part
    eval_res = (
        supabase.table("evaluations")
        .select("*")
        .eq("session_id", session_id)
        .order("q_part")
        .order("question_index")
        .execute()
    )

    evaluations = eval_res.data or []
    part1_evals = [e for e in evaluations if e.get("q_part") == "part1"]
    part2_evals = [e for e in evaluations if e.get("q_part") == "part2"]

    return {
        "session":      session,
        "part1_evals":  part1_evals,
        "part2_evals":  part2_evals,
        "evaluations":  evaluations,   # kept for backwards compat
    }


@router.get("/my-sessions")
def get_my_sessions(user: dict = Depends(require_student)):
    """All sessions for the current student, newest first."""
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select(
            "id, started_at, submitted_at, completed, schema_version, "
            "score_awarded, score_max, grade, "
            "part1_score_awarded, part1_score_max, part1_completed, "
            "part2_score_awarded, part2_score_max, part2_completed, "
            "chapters!inner(name_bn, chapter_number, "
            "books!inner(subjects!inner(display_name_bn)))"
        )
        .eq("user_id", user_id)
        .order("started_at", desc=True)
        .execute()
    )

    sessions = []
    for s in (res.data or []):
        chapter = s.pop("chapters", {}) or {}
        book    = chapter.get("books",    {}) or {}
        subject = book.get("subjects",    {}) or {}
        sessions.append({
            **s,
            "chapter_name":  chapter.get("name_bn", ""),
            "chapter_number": chapter.get("chapter_number"),
            "subject_name":  subject.get("display_name_bn", ""),
        })

    return {"sessions": sessions}


@router.delete("/session/{session_id}")
def delete_session(
    session_id: str,
    user:       dict = Depends(require_student),
):
    """Delete a pending (non-completed) session."""
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select("id, completed")
        .eq("id",      session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if res.data["completed"]:
        raise HTTPException(status_code=400, detail="Completed sessions cannot be deleted")

    supabase.table("exam_sessions").delete().eq("id", session_id).execute()
    return {"deleted": True, "session_id": session_id}
