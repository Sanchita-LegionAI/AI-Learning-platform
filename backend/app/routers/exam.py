"""
routers/exam.py  — v4
Adds:
  POST /api/exam/skip-part2        — skip Part 2, deduct 1 mark, complete session
  POST /api/exam/ai-evaluation     — subject-wise AI evaluation (once per WEEK)
  GET  /api/exam/ai-evaluations    — list saved evaluations for this user
"""
import base64
import math
from datetime import datetime, timezone, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import require_student
from app.core.supabase import get_supabase
from app.services.evaluation_service import evaluate_part2
from app.services.part1_evaluator import evaluate_part1
from app.services.question_service import get_exam_config, select_questions_for_exam, serialise_questions
from app.services.r2_service import upload_answer_image
from app.services.llm_router import call_llm
from app.services.subject_evaluation_service import (
    build_subject_summary,
    build_evaluation_prompt,
    bn_digits,
)

router = APIRouter(prefix="/api/exam", tags=["exam"])


# =============================================================================
# HELPERS
# =============================================================================

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _assign_grade(pct: float) -> str:
    if pct >= 90: return "A+"
    if pct >= 80: return "A"
    if pct >= 70: return "B+"
    if pct >= 60: return "B"
    if pct >= 50: return "C"
    return "D"


def _compute_marks(questions: list) -> float:
    return sum(float(q.get("marks", 0)) for q in questions)


# =============================================================================
# REQUEST MODELS
# =============================================================================

class GenerateExamRequest(BaseModel):
    chapter_id: int
    config_id:  Optional[int] = None


class SubmitPart1Request(BaseModel):
    session_id: str
    answers:    dict  # { "question_db_id": answer_value }


class UploadAnswerRequest(BaseModel):
    session_id:   str
    image_base64: str
    content_type: str = "image/jpeg"


class OcrRequest(BaseModel):
    session_id: str


class SubmitOcrAnswersRequest(BaseModel):
    session_id:        str
    confirmed_answers: dict  # { "slot_id": "text" }


class EvaluatePart2Request(BaseModel):
    session_id: str


class SkipPart2Request(BaseModel):
    session_id: str


class AiEvaluationRequest(BaseModel):
    pass  # no body needed — uses authenticated user


# =============================================================================
# GENERATE EXAM
# =============================================================================

@router.post("/generate")
def generate_exam(
    body:    GenerateExamRequest,
    user:    dict = Depends(require_student),
):
    user_id  = user["user_id"]
    supabase = get_supabase()

    # Load chapter + book + subject
    ch_res = (
        supabase.table("chapters")
        .select("id, name_bn, chapter_number, active, books!inner(id, title_bn, subjects!inner(display_name_bn))")
        .eq("id", body.chapter_id)
        .single()
        .execute()
    )
    if not ch_res.data:
        raise HTTPException(status_code=404, detail="Chapter not found")

    chapter = ch_res.data
    if not chapter["active"]:
        raise HTTPException(status_code=400, detail="Chapter is not active")

    book    = chapter["books"]
    subject = book["subjects"]

    config = get_exam_config(body.config_id)

    # Select questions
    part1_qs, part2_qs, _ = select_questions_for_exam(body.chapter_id, config)
    part1_qs = serialise_questions(part1_qs)
    part2_qs = serialise_questions(part2_qs)

    p1_max = sum(float(q.get("marks", 0)) for q in part1_qs)
    p2_max = sum(float(q.get("marks", 0)) for q in part2_qs)

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


# =============================================================================
# SUBMIT PART 1
# =============================================================================

@router.post("/submit-part1")
def submit_part1(
    body: SubmitPart1Request,
    user: dict = Depends(require_student),
):
    user_id  = user["user_id"]
    supabase = get_supabase()

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

    evaluation = evaluate_part1(part1_questions, body.answers)

    eval_rows = []
    for i, r in enumerate(evaluation["results"]):
        eval_rows.append({
            "session_id":     body.session_id,
            "question_index": i,
            "question_id":    r.get("question_id"),
            "q_type":         r["q_type"],
            "q_part":         "part1",
            "question_bn":    r["question_bn"],
            "student_answer": str(r.get("student_answer", "")),
            "correct_answer": str(r.get("correct_answer", "")),
            "marks_awarded":  r["marks_awarded"],
            "marks_max":      r["marks_max"],
            "is_correct":     r["is_correct"],
        })

    if eval_rows:
        supabase.table("evaluations").insert(eval_rows).execute()

    supabase.table("exam_sessions").update({
        "part1_answers":      body.answers,
        "part1_score_awarded": evaluation["score_awarded"],
        "part1_score_max":    evaluation["score_max"],
        "part1_completed":    True,
    }).eq("id", body.session_id).execute()

    return {
        "session_id":    body.session_id,
        "score_awarded": evaluation["score_awarded"],
        "score_max":     evaluation["score_max"],
        "percentage":    evaluation["percentage"],
        "grade":         evaluation["grade"],
        "results":       evaluation["results"],
    }


# =============================================================================
# SKIP PART 2  (new)
# =============================================================================

@router.post("/skip-part2")
def skip_part2(
    body: SkipPart2Request,
    user: dict = Depends(require_student),
):
    """
    Student chooses to skip Part 2.
    Deducts 1 mark from Part 1 score (floor 0), completes the session.
    No LLM call — saves cost entirely.
    """
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select("id, part1_score_awarded, part1_score_max, part2_score_max, score_max, part1_completed, completed")
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
        raise HTTPException(status_code=400, detail="Complete Part 1 first")

    p1_awarded  = float(session["part1_score_awarded"] or 0)
    score_max   = float(session["score_max"] or 0)

    # Deduct 1 mark, floor at 0
    total_awarded = max(0.0, p1_awarded - 1.0)
    pct           = round((total_awarded / score_max) * 100) if score_max > 0 else 0
    grade         = _assign_grade(pct)

    supabase.table("exam_sessions").update({
        "part2_score_awarded": 0,
        "part2_score_max":     float(session["part2_score_max"] or 0),
        "part2_completed":     True,
        "score_awarded":       total_awarded,
        "grade":               grade,
        "submitted_at":        datetime.now(timezone.utc).isoformat(),
        "completed":           True,
    }).eq("id", body.session_id).execute()

    return {
        "session_id":        body.session_id,
        "part2_skipped":     True,
        "penalty":           -1,
        "total_score":       total_awarded,
        "total_max":         score_max,
        "grade":             grade,
        "percentage":        pct,
    }


# =============================================================================
# UPLOAD ANSWER IMAGE
# =============================================================================

@router.post("/upload-answer")
def upload_answer(
    body: UploadAnswerRequest,
    user: dict = Depends(require_student),
):
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
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    supabase.table("exam_sessions").update({
        "answer_image_key":        object_key,
        "answer_image_url":        signed_url,
        "answer_image_expires_at": expires_at,
    }).eq("id", body.session_id).execute()

    return {
        "session_id": body.session_id,
        "image_url":  signed_url,
        "expires_at": expires_at,
    }


# =============================================================================
# OCR
# =============================================================================

@router.post("/ocr")
def run_ocr(
    body:    OcrRequest,
    request: Request,
    user:    dict = Depends(require_student),
):
    user_id  = user["user_id"]
    ip       = _get_client_ip(request)
    supabase = get_supabase()

    from app.services.ocr_service import run_ocr_on_session
    result = run_ocr_on_session(body.session_id, user_id, ip)
    return result


@router.post("/submit-ocr-answers")
def submit_ocr_answers(
    body: SubmitOcrAnswersRequest,
    user: dict = Depends(require_student),
):
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

    session = res.data
    if session["completed"]:
        raise HTTPException(status_code=400, detail="Session already completed")
    if not session["part1_completed"]:
        raise HTTPException(status_code=400, detail="Part 1 not completed")

    supabase.table("exam_sessions").update({
        "part2_ocr_answers": body.confirmed_answers,
    }).eq("id", body.session_id).execute()

    return {"session_id": body.session_id, "confirmed": True}


# =============================================================================
# EVALUATE PART 2
# =============================================================================

@router.post("/evaluate-part2")
def evaluate_part2_endpoint(
    body:    EvaluatePart2Request,
    request: Request,
    user:    dict = Depends(require_student),
):
    user_id  = user["user_id"]
    ip       = _get_client_ip(request)
    supabase = get_supabase()

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
            confirmed_answers = confirmed,
            user_id           = user_id,
            ip_address        = ip,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result


# =============================================================================
# AI EVALUATION — subject-wise, deterministic stats + LLM commentary
# =============================================================================

EVAL_COOLDOWN_DAYS = 7   # one AI evaluation per week (global, across subjects)
EVAL_MIN_EXAMS     = 2   # minimum completed exams in the subject


class AiEvaluationRequest(BaseModel):
    book_id: int


@router.post("/ai-evaluation")
def request_ai_evaluation(
    body:    AiEvaluationRequest,
    request: Request,
    user:    dict = Depends(require_student),
):
    """
    Subject-wise AI evaluation:
      1. Weekly limit check (latest ai_evaluations.created_at)
      2. Deterministic aggregation of ALL completed exams for the chosen book
         (per-question correct/wrong history, repeatedly-wrong questions,
         topic & chapter accuracy) — zero LLM cost
      3. LLM writes Bengali feedback grounded strictly in those numbers
      4. Saved to ai_evaluations with book_id + stats_json
    """
    user_id  = user["user_id"]
    ip       = _get_client_ip(request)
    supabase = get_supabase()

    # ── Weekly limit ──────────────────────────────────────────────────────────
    last_res = (
        supabase.table("ai_evaluations")
        .select("created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if last_res.data:
        last_at = datetime.fromisoformat(
            last_res.data[0]["created_at"].replace("Z", "+00:00")
        )
        next_at = last_at + timedelta(days=EVAL_COOLDOWN_DAYS)
        now     = datetime.now(timezone.utc)
        if now < next_at:
            next_bn = bn_digits(next_at.strftime("%d/%m/%Y"))
            raise HTTPException(
                status_code=429,
                detail={
                    "message_bn": (
                        "AI মূল্যায়ন সপ্তাহে একবার করা যায়। "
                        f"পরবর্তী মূল্যায়ন করা যাবে {next_bn} তারিখে। "
                        "এর মধ্যে আরও পরীক্ষা দাও!"
                    ),
                    "code":          "EVAL_LIMIT_REACHED",
                    "next_available": next_at.isoformat(),
                },
            )

    # ── Deterministic subject summary ─────────────────────────────────────────
    try:
        summary = build_subject_summary(user_id=user_id, book_id=body.book_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if summary is None or summary["stats"]["exam_count"] < EVAL_MIN_EXAMS:
        done = summary["stats"]["exam_count"] if summary else 0
        raise HTTPException(
            status_code=400,
            detail={
                "message_bn": (
                    f"এই বিষয়ে এখনো পর্যাপ্ত পরীক্ষা দেওয়া হয়নি "
                    f"({bn_digits(done)}টি সম্পন্ন)। মূল্যায়নের জন্য কমপক্ষে "
                    f"{bn_digits(EVAL_MIN_EXAMS)}টি পরীক্ষা সম্পন্ন করতে হবে।"
                ),
                "code": "NOT_ENOUGH_EXAMS",
            },
        )

    stats = summary["stats"]

    # ── Call LLM with the grounded prompt ─────────────────────────────────────
    try:
        response_text = call_llm(
            purpose       = "ai_summary",
            system_prompt = "তুমি একজন অভিজ্ঞ বাংলা মাধ্যমের শিক্ষক। তুমি সবসময় বাংলায় উত্তর দাও।",
            user_prompt   = build_evaluation_prompt(summary),
            user_id       = user_id,
            ip_address    = ip,
            session_id    = None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI evaluation failed: {e}")

    # ── Save evaluation ───────────────────────────────────────────────────────
    eval_res = supabase.table("ai_evaluations").insert({
        "user_id":          user_id,
        "book_id":          body.book_id,
        "session_count":    stats["exam_count"],
        "stats_json":       stats,
        "full_response_bn": response_text,
    }).execute()

    eval_id = eval_res.data[0]["id"]

    return {
        "id":               eval_id,
        "created_at":       datetime.now(timezone.utc).isoformat(),
        "book_id":          body.book_id,
        "book_title_bn":    stats["book_title_bn"],
        "subject_bn":       stats["subject_bn"],
        "session_count":    stats["exam_count"],
        "stats_json":       stats,
        "full_response_bn": response_text,
    }


@router.get("/ai-evaluations")
def get_ai_evaluations(user: dict = Depends(require_student)):
    """Return all saved AI evaluations for this user, newest first."""
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("ai_evaluations")
        .select("id, created_at, session_count, full_response_bn, "
                "book_id, stats_json, books(title_bn)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    evaluations = []
    for e in (res.data or []):
        book = e.pop("books", None) or {}
        e["book_title_bn"] = book.get("title_bn")
        evaluations.append(e)

    return {"evaluations": evaluations}



# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

@router.get("/session/{session_id}")
def get_session(session_id: str, user: dict = Depends(require_student)):
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select(
            "*, chapters!inner(name_bn, chapter_number, "
            "books!inner(subjects!inner(display_name_bn)))"
        )
        .eq("id",      session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    s       = res.data
    chapter = s.pop("chapters", {}) or {}
    book    = chapter.get("books", {}) or {}
    subject = book.get("subjects", {}) or {}

    evals_res = (
        supabase.table("evaluations")
        .select("*")
        .eq("session_id", session_id)
        .order("question_index")
        .execute()
    )
    evals = evals_res.data or []

    return {
        "session": {
            **s,
            "chapter_name":  chapter.get("name_bn", ""),
            "chapter_number": chapter.get("chapter_number"),
            "subject_name":  subject.get("display_name_bn", ""),
        },
        "part1_evals": [e for e in evals if e["q_part"] == "part1"],
        "part2_evals": [e for e in evals if e["q_part"] == "part2"],
    }


@router.get("/my-sessions")
def my_sessions(user: dict = Depends(require_student)):
    user_id  = user["user_id"]
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select(
            "id, started_at, submitted_at, completed, grade, "
            "score_awarded, score_max, "
            "part1_score_awarded, part1_score_max, part1_completed, "
            "part2_score_awarded, part2_score_max, part2_completed, "
            "part1_questions, part2_questions, answer_image_key, "
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
            "chapter_name":   chapter.get("name_bn", ""),
            "chapter_number": chapter.get("chapter_number"),
            "subject_name":   subject.get("display_name_bn", ""),
        })

    return {"sessions": sessions}


@router.delete("/session/{session_id}")
def delete_session(session_id: str, user: dict = Depends(require_student)):
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
        raise HTTPException(status_code=400, detail="Cannot delete a completed session")

    supabase.table("exam_sessions").delete().eq("id", session_id).execute()
    return {"deleted": True}
