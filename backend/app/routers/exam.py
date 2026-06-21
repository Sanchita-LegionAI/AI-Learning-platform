"""
routers/exam.py
POST /api/exam/generate       — step 2+3: select from bank + LLM rephrase
POST /api/exam/upload-answer  — step 4: upload image to R2
POST /api/exam/evaluate       — step 5: vision LLM evaluation
GET  /api/exam/session/{id}   — fetch full session result
"""
import base64
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.core.auth import get_current_user, require_student
from app.core.supabase import get_supabase
from app.core.config import get_settings
from app.services.question_service import generate_exam_paper
from app.services.evaluation_service import evaluate_session
from app.services.r2_service import upload_answer_image

router = APIRouter(prefix="/api/exam", tags=["exam"])


# =============================================================================
# HELPERS
# =============================================================================

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


def check_daily_limit(user_id: str) -> bool:
    """Call the atomic DB function. Returns True if allowed."""
    settings = get_settings()
    supabase = get_supabase()
    res = supabase.rpc(
        "increment_daily_usage",
        {"p_user_id": user_id, "p_limit": settings.DAILY_EXAM_LIMIT}
    ).execute()
    # Supabase RPC can return bool directly or wrap in list
    raw = res.data
    if isinstance(raw, list): raw = raw[0] if raw else False
    allowed = raw is True or raw == True
    print(f"[daily_limit] user={user_id} data={res.data!r} allowed={allowed}")
    return allowed


def get_chapter_context(chapter_id: int) -> dict:
    """Fetch chapter + book + subject + class details."""
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
# MODELS
# =============================================================================

class GenerateRequest(BaseModel):
    chapter_id: int
    config_id: Optional[int] = None   # uses active config if not specified


class UploadAnswerRequest(BaseModel):
    session_id: str
    image_base64: str                  # base64-encoded image from frontend
    content_type: str = "image/jpeg"  # image/jpeg or image/png


class EvaluateRequest(BaseModel):
    session_id: str


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/generate")
def generate_exam(
    body: GenerateRequest,
    request: Request,
    user: dict = Depends(require_student),
):
    """
    Step 2 + 3: Generate a fresh exam paper.
    - Program randomly selects questions from bank by marks distribution
    - LLM rephrases/merges stems into a fresh unique paper
    - Creates exam_session row and returns generated questions
    """
    user_id = user["user_id"]
    ip = get_client_ip(request)

    # Daily limit check (atomic DB increment)
    if not check_daily_limit(user_id):
        settings = get_settings()
        raise HTTPException(
            status_code=429,
            detail={
                "message_bn": "আজকের পরীক্ষার সীমা শেষ হয়েছে। কাল আবার এসো!",
                "message_en": f"Daily exam limit of {settings.DAILY_EXAM_LIMIT} reached. Try again tomorrow.",
            },
        )

    # Load chapter context
    chapter = get_chapter_context(body.chapter_id)
    book = chapter["books"]
    subject = book["subjects"]
    cls = subject["classes"]

    # Extract class number from "Class 7" → 7
    try:
        class_number = int(cls["name"].split()[-1])
    except (ValueError, IndexError):
        class_number = 7

    supabase = get_supabase()

    # Create exam session (placeholder — will be updated with generated questions)
    session_res = (
        supabase.table("exam_sessions")
        .insert({
            "user_id":    user_id,
            "chapter_id": body.chapter_id,
        })
        .execute()
    )
    session_id = session_res.data[0]["id"]

    try:
        generated_questions, source_ids, config_id = generate_exam_paper(
            chapter_id=body.chapter_id,
            chapter_name=chapter["name_bn"],
            subject_name=subject["display_name_bn"],
            class_number=class_number,
            session_id=session_id,
            user_id=user_id,
            ip_address=ip,
            config_id=body.config_id,
        )
    except Exception as e:
        # Clean up failed session
        supabase.table("exam_sessions").delete().eq("id", session_id).execute()
        raise HTTPException(status_code=500, detail=str(e))

    # Update session with generated questions and source IDs
    supabase.table("exam_sessions").update({
        "generated_questions":  generated_questions,
        "source_question_ids":  source_ids,
        "exam_config_id":       config_id,
    }).eq("id", session_id).execute()

    return {
        "session_id":          session_id,
        "chapter_name":        chapter["name_bn"],
        "subject":             subject["display_name_bn"],
        "generated_questions": generated_questions,
        "total_marks":         sum(q.get("marks", 0) for q in generated_questions),
    }


@router.post("/upload-answer")
def upload_answer(
    body: UploadAnswerRequest,
    user: dict = Depends(require_student),
):
    """
    Step 4: Upload handwritten answer sheet image to R2.
    Stores object key + signed URL in exam_session.
    """
    user_id = user["user_id"]
    supabase = get_supabase()

    # Verify session belongs to user
    res = (
        supabase.table("exam_sessions")
        .select("id, completed, answer_image_key")
        .eq("id", body.session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if res.data["completed"]:
        raise HTTPException(status_code=400, detail="Session already completed")
    if res.data.get("answer_image_key"):
        raise HTTPException(status_code=400, detail="Answer already uploaded for this session")

    # Decode base64 image
    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    # Upload to R2
    try:
        object_key, signed_url, expires_at = upload_answer_image(
            session_id=body.session_id,
            user_id=user_id,
            image_bytes=image_bytes,
            content_type=body.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {e}")

    # Store in session
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


@router.post("/evaluate")
def evaluate_exam(
    body: EvaluateRequest,
    request: Request,
    user: dict = Depends(require_student),
):
    """
    Step 5: Evaluate handwritten answers using vision LLM.
    - Gets image URL from R2 (refreshes if expired)
    - Sends questions + image to GPT-4.1 Nano
    - Stores per-question evaluations
    - Returns scores, grades, feedback, model answers
    """
    user_id = user["user_id"]
    ip = get_client_ip(request)

    # Get class number for prompt
    supabase = get_supabase()
    res = (
        supabase.table("exam_sessions")
        .select("chapter_id")
        .eq("id", body.session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    chapter = get_chapter_context(res.data["chapter_id"])
    cls = chapter["books"]["subjects"]["classes"]
    try:
        class_number = int(cls["name"].split()[-1])
    except (ValueError, IndexError):
        class_number = 7

    try:
        result = evaluate_session(
            session_id=body.session_id,
            user_id=user_id,
            class_number=class_number,
            ip_address=ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result


@router.get("/session/{session_id}")
def get_session(
    session_id: str,
    user: dict = Depends(require_student),
):
    """Fetch full session result including per-question evaluations."""
    user_id = user["user_id"]
    supabase = get_supabase()

    # Fetch session
    res = (
        supabase.table("exam_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = res.data

    # Fetch evaluations if completed
    evaluations = []
    if session["completed"]:
        eval_res = (
            supabase.table("evaluations")
            .select("*")
            .eq("session_id", session_id)
            .order("question_index")
            .execute()
        )
        evaluations = eval_res.data

    return {
        "session":     session,
        "evaluations": evaluations,
    }


@router.get("/my-sessions")
def get_my_sessions(user: dict = Depends(require_student)):
    """
    Return all exam sessions for the current user,
    enriched with chapter/subject names for display.
    """
    user_id = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select(
            "id, started_at, submitted_at, completed, "
            "generated_questions, answer_image_key, "
            "score_awarded, score_max, grade, "
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
        book    = chapter.get("books", {}) or {}
        subject = book.get("subjects", {}) or {}
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
    user: dict = Depends(require_student),
):
    """
    Delete a pending (non-completed) exam session.
    Completed (evaluated) sessions cannot be deleted by students.
    """
    user_id = user["user_id"]
    supabase = get_supabase()

    # Verify ownership and non-completed
    res = (
        supabase.table("exam_sessions")
        .select("id, completed")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if res.data["completed"]:
        raise HTTPException(
            status_code=400,
            detail="Completed sessions cannot be deleted"
        )

    supabase.table("exam_sessions").delete().eq("id", session_id).execute()
    return {"deleted": True, "session_id": session_id}
