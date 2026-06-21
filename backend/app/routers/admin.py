"""
routers/admin.py
GET  /api/admin/config          — current active providers per purpose
POST /api/admin/config          — switch active provider (no restart)
GET  /api/admin/usage-summary   — aggregated cost data
GET  /api/admin/usage-logs      — filterable log entries
DELETE /api/admin/logs          — clear logs
GET  /api/admin/chapters        — chapters with question counts
GET  /api/admin/chapter-stats   — performance analytics
POST /api/admin/questions/import — trigger reimport from question_bank/ folder
"""
import subprocess
import sys
import os
from pathlib import Path
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.core.auth import require_admin
from app.core.supabase import get_supabase

router = APIRouter(prefix="/api/admin", tags=["admin"])


# =============================================================================
# MODELS
# =============================================================================

class ProviderUpdateRequest(BaseModel):
    purpose: str                # question_generation | evaluation | tutor
    provider_name: str          # openai | anthropic
    model_name: str


# =============================================================================
# PROVIDER CONFIG (runtime model switching)
# =============================================================================

@router.get("/config")
def get_provider_config(admin: dict = Depends(require_admin)):
    """Current active + available providers per purpose."""
    supabase = get_supabase()
    res = supabase.table("providers").select("*").order("purpose").order("active", desc=True).execute()
    providers = res.data

    # Group by purpose
    grouped = {}
    for p in providers:
        purpose = p["purpose"]
        if purpose not in grouped:
            grouped[purpose] = {"active": None, "available": []}
        if p["active"]:
            grouped[purpose]["active"] = p
        else:
            grouped[purpose]["available"].append(p)

    return {"providers": grouped}


@router.post("/config")
def update_provider(
    body: ProviderUpdateRequest,
    admin: dict = Depends(require_admin),
):
    """
    Switch active provider for a purpose.
    Deactivates current active provider, activates the selected one.
    No restart required — LLM router reads DB on every call.
    """
    supabase = get_supabase()

    # Verify target provider exists
    res = (
        supabase.table("providers")
        .select("id")
        .eq("purpose", body.purpose)
        .eq("provider_name", body.provider_name)
        .eq("model_name", body.model_name)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Deactivate all providers for this purpose
    supabase.table("providers").update({"active": False}).eq("purpose", body.purpose).execute()

    # Activate the selected one
    supabase.table("providers").update({"active": True}).eq("id", res.data["id"]).execute()

    return {
        "switched": True,
        "purpose":  body.purpose,
        "active":   f"{body.provider_name} / {body.model_name}",
        "message":  "Provider switched. Takes effect immediately — no restart needed.",
    }


# =============================================================================
# USAGE & COST
# =============================================================================

@router.get("/usage-summary")
def get_usage_summary(admin: dict = Depends(require_admin)):
    """Aggregated cost data via v_cost_summary view (last 30 days)."""
    supabase = get_supabase()
    res = supabase.table("v_cost_summary").select("*").execute()

    # Also fetch projection
    proj = supabase.table("v_cost_projection").select("*").execute()

    return {
        "summary":    res.data,
        "projection": proj.data[0] if proj.data else {},
    }


@router.get("/usage-logs")
def get_usage_logs(
    admin: dict = Depends(require_admin),
    from_date: Optional[date] = Query(None),
    to_date:   Optional[date] = Query(None),
    call_type: Optional[str]  = Query(None),
    provider:  Optional[str]  = Query(None),
    success:   Optional[bool] = Query(None),
    limit:     int            = Query(100, le=500),
    offset:    int            = Query(0),
):
    """Filterable API call log for admin dashboard."""
    supabase = get_supabase()
    query = (
        supabase.table("api_calls")
        .select("*")
        .order("timestamp", desc=True)
        .limit(limit)
        .offset(offset)
    )

    if from_date:
        query = query.gte("timestamp", from_date.isoformat())
    if to_date:
        query = query.lte("timestamp", f"{to_date.isoformat()}T23:59:59")
    if call_type:
        query = query.eq("call_type", call_type)
    if provider:
        query = query.eq("provider", provider)
    if success is not None:
        query = query.eq("success", success)

    res = query.execute()
    return {"logs": res.data, "count": len(res.data)}


@router.delete("/logs")
def clear_logs(admin: dict = Depends(require_admin)):
    """Clear all API call logs (admin only)."""
    supabase = get_supabase()
    supabase.table("api_calls").delete().neq("id", 0).execute()
    return {"cleared": True}


# =============================================================================
# CONTENT MANAGEMENT
# =============================================================================

@router.get("/chapters")
def get_chapters_admin(admin: dict = Depends(require_admin)):
    """All chapters with question counts (from v_curriculum view)."""
    supabase = get_supabase()
    res = supabase.table("v_curriculum").select("*").execute()
    return {"chapters": res.data}


@router.get("/chapter-stats")
def get_chapter_stats(admin: dict = Depends(require_admin)):
    """Performance analytics per chapter."""
    supabase = get_supabase()
    res = (
        supabase.table("chapter_stats")
        .select(
            "*, chapters!inner(name_bn, chapter_number, "
            "books!inner(title_bn, book_id_code))"
        )
        .order("total_attempts", desc=True)
        .execute()
    )
    return {"stats": res.data}


@router.post("/questions/import")
def trigger_import(admin: dict = Depends(require_admin)):
    """
    Import questions directly from question_bank/ folder (inline, no subprocess).
    """
    import json

    supabase = get_supabase()
    backend_dir = Path(__file__).parent.parent.parent
    bank_path = backend_dir / "question_bank"

    stats = {"files": 0, "inserted": 0, "skipped": 0, "errors": 0}
    log = []

    if not bank_path.exists():
        raise HTTPException(status_code=500, detail=f"question_bank not found at {bank_path}")

    files = sorted(bank_path.rglob("*_questions.json"))
    log.append(f"Found {len(files)} JSON files under {bank_path}")

    for filepath in files:
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            book_id_code = data["book_id"]
            chapter_number = data["chapter_no"]
            questions = data["questions"]

            # Step 1: find book
            book_res = supabase.table("books").select("id").eq("book_id_code", book_id_code).single().execute()
            if not book_res.data:
                log.append(f"SKIP {filepath.name}: book {book_id_code} not found")
                stats["errors"] += 1
                continue

            book_id = book_res.data["id"]

            # Step 2: find chapter
            ch_res = supabase.table("chapters").select("id").eq("book_id", book_id).eq("chapter_number", chapter_number).single().execute()
            if not ch_res.data:
                log.append(f"SKIP {filepath.name}: chapter {chapter_number} not found")
                stats["errors"] += 1
                continue

            chapter_id = ch_res.data["id"]

            # Step 3: get existing codes
            existing = supabase.table("questions").select("question_code").eq("chapter_id", chapter_id).execute()
            existing_codes = {r["question_code"] for r in existing.data}

            # Step 4: insert new questions in batches
            rows = []
            for q in questions:
                # Prefix with book_id to ensure uniqueness across books
                unique_code = f"{book_id_code}__{q['id']}"
                if unique_code in existing_codes:
                    stats["skipped"] += 1
                    continue
                rows.append({
                    "question_code": unique_code,
                    "chapter_id": chapter_id,
                    "question_bn": q["question"].strip(),
                    "marks": q["marks"],
                    "difficulty": q.get("difficulty", "Medium"),
                    "topic_tag": q.get("topic", "").strip() or None,
                    "expected_lines": q.get("expected_lines", "").strip() or None,
                    "active": True,
                })

            inserted = 0
            for i in range(0, len(rows), 50):
                batch = rows[i:i+50]
                res = supabase.table("questions").insert(batch).execute()
                inserted += len(res.data)

            log.append(f"OK {filepath.name}: inserted={inserted} skipped={len(existing_codes)}")
            stats["inserted"] += inserted
            stats["files"] += 1

        except Exception as e:
            log.append(f"ERROR {filepath.name}: {e}")
            stats["errors"] += 1

    return {
        "success": stats["errors"] == 0,
        "stdout": "\n".join(log),
        "stderr": "",
        "stats": stats,
    }


# =============================================================================
# ADMIN EXAM LOGS — view all student sessions, delete to free space
# =============================================================================

@router.get("/exam-logs")
def get_exam_logs(
    limit:  int = Query(50, le=200),
    offset: int = Query(0),
    completed: Optional[bool] = Query(None),
    admin: dict = Depends(require_admin),
):
    """
    All exam sessions across all students.
    Filterable by completed status. Ordered newest first.
    """
    supabase = get_supabase()

    query = (
        supabase.table("exam_sessions")
        .select(
            "id, user_id, started_at, submitted_at, completed, "
            "score_awarded, score_max, grade, answer_image_key, "
            "chapters!inner(name_bn, books!inner(subjects!inner(display_name_bn))), "
            "users!inner(display_name, phone)"
        )
        .order("started_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if completed is not None:
        query = query.eq("completed", completed)

    res = query.execute()

    rows = []
    for s in (res.data or []):
        chapter = s.pop("chapters", {}) or {}
        book    = chapter.get("books", {}) or {}
        subject = book.get("subjects", {}) or {}
        usr     = s.pop("users", {}) or {}
        rows.append({
            **s,
            "chapter_name": chapter.get("name_bn", ""),
            "subject_name": subject.get("display_name_bn", ""),
            "student_name": usr.get("display_name", ""),
            "student_phone": usr.get("phone", ""),
        })

    return {"exam_logs": rows, "total": len(rows)}


@router.delete("/exam/{session_id}")
def delete_exam_session(
    session_id: str,
    admin: dict = Depends(require_admin),
):
    """Delete any exam session (admin only). Frees R2 image reference."""
    supabase = get_supabase()
    res = supabase.table("exam_sessions").select("id").eq("id", session_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    supabase.table("exam_sessions").delete().eq("id", session_id).execute()
    return {"deleted": True, "session_id": session_id}
