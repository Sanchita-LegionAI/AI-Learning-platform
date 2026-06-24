"""
routers/admin.py
GET    /api/admin/config            — current active providers per purpose
POST   /api/admin/config            — switch active provider (no restart)
GET    /api/admin/usage-summary     — aggregated cost data (last 30 days)
GET    /api/admin/usage-logs        — filterable API call log
DELETE /api/admin/logs              — clear API call logs
GET    /api/admin/chapters          — chapters with per-type question counts
GET    /api/admin/chapter-stats     — performance analytics per chapter
POST   /api/admin/questions/import  — import from question_bank/ folder (v4 format)
GET    /api/admin/exam-logs         — all student sessions
DELETE /api/admin/exam/{session_id} — delete any session
GET    /api/admin/exam-config       — list exam configs with computed marks
POST   /api/admin/exam-config       — create or update an exam config
PATCH  /api/admin/exam-config/{id}/activate — set one config as active
"""
import json
from pathlib import Path
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.core.auth import require_admin
from app.core.supabase import get_supabase

router = APIRouter(prefix="/api/admin", tags=["admin"])


# =============================================================================
# FIELD TRANSFORMS (JSON → DB)
# =============================================================================

PART_MAP = {1: "part1", 2: "part2"}

def _difficulty(raw: str) -> str:
    """'easy' → 'Easy' etc. — DB enum is Title case."""
    return raw.strip().capitalize() if raw else "Medium"


def _build_question_row(
    q: dict,
    q_type: str,
    chapter_id: int,
    book_id_code: str,
) -> dict:
    """
    Convert a single question dict from the JSON bank into a DB row dict.
    All type-specific JSONB fields are serialised to strings here;
    supabase-py handles the cast to jsonb automatically.
    """
    unique_code = f"{book_id_code}__{q['id']}"
    part_raw    = q.get("part", 1)
    q_part      = PART_MAP.get(part_raw, "part1")

    row = {
        "question_code":  unique_code,
        "chapter_id":     chapter_id,
        "q_type":         q_type,
        "q_part":         q_part,
        "marks":          q["marks"],
        "marks_per_item": q.get("marks_per_item"),          # None for most types
        "difficulty":     _difficulty(q.get("difficulty", "medium")),
        "topic_bn":       (q.get("topic_bn") or "").strip() or None,
        "question_bn":    q["question_bn"].strip(),
        # Type-specific — None when not applicable
        "options":        q.get("options"),                 # MCQ
        "correct_answer": q.get("correct_answer"),          # MCQ / true_false
        "pairs":          q.get("pairs"),                   # match_pairs
        "items":          q.get("items"),                   # tap_sequence (shuffled)
        "correct_order":  q.get("correct_order"),           # tap_sequence
        "categories":     q.get("categories"),              # categorize
        "expected_answer": q.get("expected_answer"),        # short_write
        "max_words":      q.get("max_words"),               # short_write
        "answer_slot_id": q.get("answer_slot_id"),          # short_write
        "active":         True,
    }
    return row


# =============================================================================
# MODELS
# =============================================================================

class ProviderUpdateRequest(BaseModel):
    purpose:       str   # evaluation | tutor (question_generation retired)
    provider_name: str
    model_name:    str


class ExamConfigRequest(BaseModel):
    config_name:            str
    description:            Optional[str] = None
    p1_mcq_count:           int = 10
    p1_match_pairs_count:   int = 2
    p1_true_false_count:    int = 5
    p1_tap_sequence_count:  int = 2
    p1_categorize_count:    int = 1
    p2_short_write_count:   int = 5
    difficulty_easy_pct:    int = 40
    difficulty_medium_pct:  int = 40
    difficulty_hard_pct:    int = 20


# =============================================================================
# PROVIDER CONFIG
# =============================================================================

@router.get("/config")
def get_provider_config(admin: dict = Depends(require_admin)):
    """Current active + available providers per purpose."""
    supabase = get_supabase()
    res = (
        supabase.table("providers")
        .select("*")
        .order("purpose")
        .order("active", desc=True)
        .execute()
    )
    grouped = {}
    for p in res.data:
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
    """Switch active provider for a purpose. Takes effect immediately."""
    supabase = get_supabase()
    res = (
        supabase.table("providers")
        .select("id")
        .eq("purpose",       body.purpose)
        .eq("provider_name", body.provider_name)
        .eq("model_name",    body.model_name)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Provider not found")

    supabase.table("providers").update({"active": False}).eq("purpose", body.purpose).execute()
    supabase.table("providers").update({"active": True}).eq("id", res.data["id"]).execute()

    return {
        "switched": True,
        "purpose":  body.purpose,
        "active":   f"{body.provider_name} / {body.model_name}",
        "message":  "Provider switched. Takes effect immediately.",
    }


# =============================================================================
# USAGE & COST
# =============================================================================

@router.get("/usage-summary")
def get_usage_summary(admin: dict = Depends(require_admin)):
    """Aggregated cost data — last 30 days."""
    supabase = get_supabase()
    res  = supabase.table("v_cost_summary").select("*").execute()
    return {"summary": res.data}


@router.get("/usage-logs")
def get_usage_logs(
    admin:     dict           = Depends(require_admin),
    from_date: Optional[date] = Query(None),
    to_date:   Optional[date] = Query(None),
    call_type: Optional[str]  = Query(None),
    provider:  Optional[str]  = Query(None),
    success:   Optional[bool] = Query(None),
    limit:     int            = Query(100, le=500),
    offset:    int            = Query(0),
):
    supabase = get_supabase()
    query = (
        supabase.table("api_calls")
        .select("*")
        .order("timestamp", desc=True)
        .limit(limit)
        .offset(offset)
    )
    if from_date:  query = query.gte("timestamp", from_date.isoformat())
    if to_date:    query = query.lte("timestamp", f"{to_date.isoformat()}T23:59:59")
    if call_type:  query = query.eq("call_type", call_type)
    if provider:   query = query.eq("provider", provider)
    if success is not None: query = query.eq("success", success)

    res = query.execute()
    return {"logs": res.data, "count": len(res.data)}


@router.delete("/logs")
def clear_logs(admin: dict = Depends(require_admin)):
    supabase = get_supabase()
    supabase.table("api_calls").delete().neq("id", 0).execute()
    return {"cleared": True}


# =============================================================================
# EXAM CONFIG MANAGEMENT
# =============================================================================

@router.get("/exam-config")
def list_exam_configs(admin: dict = Depends(require_admin)):
    """All exam configs with computed marks (via v_exam_config view)."""
    supabase = get_supabase()
    res = supabase.table("v_exam_config").select("*").order("id").execute()
    return {"configs": res.data}


@router.post("/exam-config")
def upsert_exam_config(
    body:  ExamConfigRequest,
    admin: dict = Depends(require_admin),
):
    """Create or update an exam config by config_name."""
    supabase = get_supabase()
    payload = body.model_dump()

    # Check if exists
    existing = (
        supabase.table("exam_config")
        .select("id")
        .eq("config_name", body.config_name)
        .execute()
    )

    if existing.data:
        res = (
            supabase.table("exam_config")
            .update({**payload, "updated_at": "now()"})
            .eq("config_name", body.config_name)
            .execute()
        )
        action = "updated"
    else:
        res = supabase.table("exam_config").insert(payload).execute()
        action = "created"

    return {"action": action, "config": res.data[0] if res.data else {}}


@router.patch("/exam-config/{config_id}/activate")
def activate_exam_config(
    config_id: int,
    admin:     dict = Depends(require_admin),
):
    """Set one config as active, deactivate all others."""
    supabase = get_supabase()

    # Verify config exists
    res = supabase.table("exam_config").select("id, config_name").eq("id", config_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Config not found")

    supabase.table("exam_config").update({"active": False}).neq("id", 0).execute()
    supabase.table("exam_config").update({"active": True}).eq("id", config_id).execute()

    return {"activated": True, "config_id": config_id, "config_name": res.data["config_name"]}


# =============================================================================
# CONTENT MANAGEMENT
# =============================================================================

@router.get("/chapters")
def get_chapters_admin(admin: dict = Depends(require_admin)):
    """All chapters with per-type question counts and readiness flag."""
    supabase = get_supabase()
    res = supabase.table("v_curriculum").select("*").execute()
    return {"chapters": res.data}


@router.get("/chapter-stats")
def get_chapter_stats(admin: dict = Depends(require_admin)):
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


# =============================================================================
# QUESTION IMPORT (v4 format)
# =============================================================================
#
# New JSON structure (dict keyed by question type):
#   {
#     "book_id": "paribesh_o_bigyan",
#     "chapter_no": 1,
#     "chapter_title_bn": "...",
#     "questions": {
#       "mcq":          [ {id, type, part, marks, difficulty, topic_bn,
#                          question_bn, options, correct_answer}, ... ],
#       "match_pairs":  [ {id, type, part, marks, difficulty, topic_bn,
#                          question_bn, pairs}, ... ],
#       "true_false":   [ {id, type, part, marks, difficulty, topic_bn,
#                          question_bn, correct_answer}, ... ],
#       "tap_sequence": [ {id, type, part, marks, difficulty, topic_bn,
#                          question_bn, items, correct_order}, ... ],
#       "categorize":   [ {id, type, part, marks, marks_per_item, difficulty,
#                          topic_bn, question_bn, categories}, ... ],
#       "short_write":  [ {id, type, part, marks, difficulty, topic_bn,
#                          question_bn, expected_answer, max_words,
#                          answer_slot_id}, ... ]
#     }
#   }
#
# Folder layout expected:
#   backend/question_bank/
#     class_7/
#       paribesh_o_bigyan/
#         paribesh_o_bigyan_ch01_questions.json
#         ...
#         paribesh_o_bigyan_ch12_questions.json
# =============================================================================

VALID_TYPES = {"mcq", "match_pairs", "true_false", "tap_sequence", "categorize", "short_write"}
BATCH_SIZE  = 50


@router.post("/questions/import")
def trigger_import(admin: dict = Depends(require_admin)):
    """
    Import all questions from question_bank/ folder into the DB.
    Idempotent — skips question_codes that already exist.
    Returns per-file stats and a full log for the admin dashboard.
    """
    supabase    = get_supabase()
    backend_dir = Path(__file__).parent.parent.parent
    bank_path   = backend_dir / "question_bank"

    if not bank_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"question_bank/ not found at {bank_path}. "
                   "Ensure the folder is deployed with the backend."
        )

    stats = {"files": 0, "inserted": 0, "skipped": 0, "errors": 0}
    log: list[str] = []

    files = sorted(bank_path.rglob("*_questions.json"))
    log.append(f"Found {len(files)} JSON file(s) under {bank_path}")

    for filepath in files:
        fname = filepath.name
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            # ── Validate top-level keys ───────────────────────────────────
            book_id_code   = data.get("book_id")
            chapter_number = data.get("chapter_no")
            questions_dict = data.get("questions")

            if not book_id_code or not chapter_number or not isinstance(questions_dict, dict):
                log.append(f"SKIP {fname}: missing book_id / chapter_no / questions dict")
                stats["errors"] += 1
                continue

            # ── Resolve book ──────────────────────────────────────────────
            book_res = (
                supabase.table("books")
                .select("id")
                .eq("book_id_code", book_id_code)
                .single()
                .execute()
            )
            if not book_res.data:
                log.append(f"SKIP {fname}: book '{book_id_code}' not in DB — seed curriculum first")
                stats["errors"] += 1
                continue
            book_id = book_res.data["id"]

            # ── Resolve chapter ───────────────────────────────────────────
            ch_res = (
                supabase.table("chapters")
                .select("id")
                .eq("book_id",        book_id)
                .eq("chapter_number", chapter_number)
                .single()
                .execute()
            )
            if not ch_res.data:
                log.append(
                    f"SKIP {fname}: chapter {chapter_number} not in DB "
                    f"for book '{book_id_code}' — run reseed_chapters.sql first"
                )
                stats["errors"] += 1
                continue
            chapter_id = ch_res.data["id"]

            # ── Fetch already-imported codes for this chapter (idempotent) ─
            existing_res = (
                supabase.table("questions")
                .select("question_code")
                .eq("chapter_id", chapter_id)
                .execute()
            )
            existing_codes = {r["question_code"] for r in (existing_res.data or [])}

            # ── Build rows from all question types ────────────────────────
            rows: list[dict] = []
            type_counts: dict[str, int] = {}

            for q_type, q_list in questions_dict.items():
                if q_type not in VALID_TYPES:
                    log.append(f"  WARN {fname}: unknown type '{q_type}' — skipped")
                    continue
                if not isinstance(q_list, list):
                    log.append(f"  WARN {fname}: '{q_type}' is not a list — skipped")
                    continue

                inserted_for_type = 0
                for q in q_list:
                    row = _build_question_row(q, q_type, chapter_id, book_id_code)
                    if row["question_code"] in existing_codes:
                        stats["skipped"] += 1
                        continue
                    rows.append(row)
                    inserted_for_type += 1

                type_counts[q_type] = inserted_for_type

            # ── Batch insert ──────────────────────────────────────────────
            inserted = 0
            for i in range(0, len(rows), BATCH_SIZE):
                batch  = rows[i : i + BATCH_SIZE]
                result = supabase.table("questions").insert(batch).execute()
                inserted += len(result.data)

            stats["inserted"] += inserted
            stats["files"]    += 1

            type_summary = "  ".join(f"{t}={c}" for t, c in type_counts.items())
            log.append(
                f"OK  {fname}: inserted={inserted}  "
                f"already_existed={len(existing_codes)}  [{type_summary}]"
            )

        except json.JSONDecodeError as e:
            log.append(f"ERROR {fname}: invalid JSON — {e}")
            stats["errors"] += 1
        except Exception as e:
            log.append(f"ERROR {fname}: {e}")
            stats["errors"] += 1

    # ── Summary line ──────────────────────────────────────────────────────
    log.append(
        f"\nDone — files={stats['files']}  "
        f"inserted={stats['inserted']}  "
        f"skipped(already existed)={stats['skipped']}  "
        f"errors={stats['errors']}"
    )

    return {
        "success": stats["errors"] == 0,
        "stats":   stats,
        "log":     "\n".join(log),
    }


# =============================================================================
# EXAM SESSION LOGS
# =============================================================================

@router.get("/exam-logs")
def get_exam_logs(
    admin:     dict           = Depends(require_admin),
    limit:     int            = Query(50, le=200),
    offset:    int            = Query(0),
    completed: Optional[bool] = Query(None),
):
    """All exam sessions across all students, newest first."""
    supabase = get_supabase()
    query = (
        supabase.table("exam_sessions")
        .select(
            "id, user_id, started_at, submitted_at, completed, schema_version, "
            "score_awarded, score_max, grade, "
            "part1_score_awarded, part1_score_max, part1_completed, "
            "part2_score_awarded, part2_score_max, part2_completed, "
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
        book    = chapter.get("books",    {}) or {}
        subject = book.get("subjects",    {}) or {}
        usr     = s.pop("users",          {}) or {}
        rows.append({
            **s,
            "chapter_name":  chapter.get("name_bn", ""),
            "subject_name":  subject.get("display_name_bn", ""),
            "student_name":  usr.get("display_name", ""),
            "student_phone": usr.get("phone", ""),
        })

    return {"exam_logs": rows, "total": len(rows)}


@router.delete("/exam/{session_id}")
def delete_exam_session(
    session_id: str,
    admin:      dict = Depends(require_admin),
):
    supabase = get_supabase()
    res = (
        supabase.table("exam_sessions")
        .select("id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    supabase.table("exam_sessions").delete().eq("id", session_id).execute()
    return {"deleted": True, "session_id": session_id}
