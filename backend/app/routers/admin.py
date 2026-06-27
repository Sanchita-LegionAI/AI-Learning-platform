"""
routers/admin.py
GET  /api/admin/config                      — current active providers per purpose
POST /api/admin/config                      — switch active provider (no restart)
GET  /api/admin/usage-summary               — aggregated cost data
GET  /api/admin/usage-logs                  — filterable log entries
DELETE /api/admin/logs                      — clear logs
GET  /api/admin/chapters                    — chapters with question counts
GET  /api/admin/chapter-stats               — performance analytics
POST /api/admin/questions/import            — trigger reimport from question_bank/ folder

NEW — zero-SQL curriculum management:
POST /api/admin/curriculum/seed-book        — create subject+book+chapters from chapters JSON
POST /api/admin/curriculum/seed-questions   — import questions from questions JSON
GET  /api/admin/curriculum/tree             — full curriculum tree with question counts
DELETE /api/admin/curriculum/book/{book_id_code} — remove a book and all its chapters+questions
"""
import subprocess
import sys
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Any
from app.core.auth import require_admin
from app.core.supabase import get_supabase

router = APIRouter(prefix="/api/admin", tags=["admin"])


# =============================================================================
# MODELS
# =============================================================================

class ProviderUpdateRequest(BaseModel):
    purpose: str
    provider_name: str
    model_name: str


class SeedClassRequest(BaseModel):
    name: str              # e.g. "Class 9"
    display_name_bn: str   # e.g. "নবম শ্রেণী"


class SeedBookRequest(BaseModel):
    """
    Chapters JSON format:
    {
      "book_id_code": "otit_o_oitijhyo",
      "title_bn": "অতীত ও ঐতিহ্য",
      "subject_name": "History",
      "subject_display_bn": "ইতিহাস",
      "class_name": "Class 7",
      "total_chapters": 9,
      "chapters": [
        { "chapter_number": 1, "name_bn": "ইতিহাসের ধারণা", "subtitle_bn": "..." },
        ...
      ]
    }
    """
    book_id_code: str
    title_bn: str
    subject_name: str
    subject_display_bn: str
    class_name: str
    total_chapters: int
    chapters: list[dict]


class SeedQuestionsRequest(BaseModel):
    """
    Questions JSON — the exact format already used in question_bank/:
    {
      "book_id": "otit_o_oitijhyo",
      "chapter_no": 1,
      "chapter_title_bn": "...",
      "questions": {
        "mcq":          [...],
        "match_pairs":  [...],
        "true_false":   [...],
        "tap_sequence": [...],
        "categorize":   [...],
        "short_write":  [...]
      }
    }
    """
    book_id: str           # must match an existing book_id_code
    chapter_no: int
    chapter_title_bn: str
    questions: dict[str, list[dict]]


# =============================================================================
# PROVIDER CONFIG (runtime model switching)
# =============================================================================

@router.get("/config")
def get_provider_config(admin: dict = Depends(require_admin)):
    """Current active + available providers per purpose."""
    supabase = get_supabase()
    res = supabase.table("providers").select("*").order("purpose").order("active", desc=True).execute()
    providers = res.data

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
    supabase = get_supabase()

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

    supabase.table("providers").update({"active": False}).eq("purpose", body.purpose).execute()
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
    supabase = get_supabase()
    res  = supabase.table("v_cost_summary").select("*").execute()
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
    supabase = get_supabase()
    supabase.table("api_calls").delete().neq("id", 0).execute()
    return {"cleared": True}


# =============================================================================
# CONTENT (legacy — kept for backwards compat)
# =============================================================================

@router.get("/chapters")
def get_chapters_admin(admin: dict = Depends(require_admin)):
    """All chapters with question counts (from v_curriculum view)."""
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


@router.post("/questions/import")
def trigger_import(admin: dict = Depends(require_admin)):
    """Legacy: trigger seed_questions.py subprocess."""
    try:
        result = subprocess.run(
            [sys.executable, "seed_questions.py"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "success":  result.returncode == 0,
            "stdout":   result.stdout,
            "stderr":   result.stderr,
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Import timed out after 120 seconds")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CURRICULUM MANAGEMENT — zero-SQL interface
# =============================================================================


@router.get("/session/{session_id}")
def get_session_admin(session_id: str, admin: dict = Depends(require_admin)):
    """
    Fetch any exam session by ID (admin — no user_id filter).
    Returns full session + part1_evals + part2_evals for the Analytics detail panel.
    """
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select(
            "*, chapters!inner(name_bn, chapter_number, "
            "books!inner(subjects!inner(display_name_bn)))"
        )
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    s       = res.data
    chapter = s.pop("chapters", {}) or {}
    book    = chapter.get("books",    {}) or {}
    subject = book.get("subjects",    {}) or {}

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
            "chapter_name":   chapter.get("name_bn", ""),
            "chapter_number": chapter.get("chapter_number"),
            "subject_name":   subject.get("display_name_bn", ""),
        },
        "part1_evals": [e for e in evals if e["q_part"] == "part1"],
        "part2_evals": [e for e in evals if e["q_part"] == "part2"],
    }

@router.post("/curriculum/seed-class")
def seed_class(body: SeedClassRequest, admin: dict = Depends(require_admin)):
    """
    Create a new class (e.g. Class 9 / নবম শ্রেণী).
    Idempotent — if a class with the same name already exists it is skipped.
    """
    supabase = get_supabase()

    existing = (
        supabase.table("classes")
        .select("id, name")
        .eq("name", body.name)
        .execute()
    )
    if existing.data:
        return {
            "ok": True,
            "created": False,
            "class_id": existing.data[0]["id"],
            "message": f"Class '{body.name}' already exists — skipped.",
        }

    res = supabase.table("classes").insert({
        "name":            body.name,
        "display_name_bn": body.display_name_bn,
        "active":          True,
    }).execute()

    return {
        "ok":      True,
        "created": True,
        "class_id": res.data[0]["id"],
        "message": f"Class '{body.name}' created.",
    }


@router.get("/exam-sessions")
def get_all_exam_sessions(
    admin: dict = Depends(require_admin),
    limit: int = Query(200, le=500),
    offset: int = Query(0),
):
    """
    All completed exam sessions with student info, chapter, scores and grade.
    Used by the admin Analytics tab.
    """
    supabase = get_supabase()

    res = (
        supabase.table("exam_sessions")
        .select(
            "id, user_id, started_at, submitted_at, completed, grade, "
            "score_awarded, score_max, "
            "part1_score_awarded, part1_score_max, "
            "part2_score_awarded, part2_score_max, "
            "chapters!inner(name_bn, chapter_number, "
            "books!inner(title_bn, subjects!inner(display_name_bn)))"
        )
        .eq("completed", True)
        .order("submitted_at", desc=True)
        .limit(limit)
        .offset(offset)
        .execute()
    )

    # Fetch user display names
    user_ids = list({s["user_id"] for s in (res.data or [])})
    users_map = {}
    if user_ids:
        users_res = (
            supabase.table("users")
            .select("id, display_name, phone")
            .in_("id", user_ids)
            .execute()
        )
        for u in (users_res.data or []):
            users_map[u["id"]] = u.get("display_name") or u.get("phone") or u["id"][:8]

    sessions = []
    for s in (res.data or []):
        chapter = s.pop("chapters", {}) or {}
        book    = chapter.get("books", {}) or {}
        subject = book.get("subjects", {}) or {}
        sessions.append({
            **s,
            "display_name":   users_map.get(s["user_id"], s["user_id"][:8]),
            "chapter_name":   chapter.get("name_bn", ""),
            "chapter_number": chapter.get("chapter_number"),
            "book_title":     book.get("title_bn", ""),
            "subject_name":   subject.get("display_name_bn", ""),
        })

    return {"sessions": sessions, "total": len(sessions)}


@router.get("/curriculum/tree")
def get_curriculum_tree(admin: dict = Depends(require_admin)):
    """
    Full curriculum tree with question counts per chapter.
    Uses v_curriculum view.
    """
    supabase = get_supabase()
    rows = supabase.table("v_curriculum").select("*").execute().data

    # Group into class → subject → book → chapters
    tree: dict = {}
    for row in rows:
        cid = row["class_id"]
        sid = row["subject_id"]
        bid = row["book_id"]

        if cid not in tree:
            tree[cid] = {"class_id": cid, "class_name": row["class_name"], "subjects": {}}
        if sid not in tree[cid]["subjects"]:
            tree[cid]["subjects"][sid] = {
                "subject_id": sid, "subject_bn": row["subject_bn"], "books": {}
            }
        if bid not in tree[cid]["subjects"][sid]["books"]:
            tree[cid]["subjects"][sid]["books"][bid] = {
                "book_id": bid,
                "book_id_code": row["book_id_code"],
                "title_bn": row["title_bn"],
                "chapters": [],
            }

        tree[cid]["subjects"][sid]["books"][bid]["chapters"].append({
            "chapter_id":     row["chapter_id"],
            "chapter_number": row["chapter_number"],
            "name_bn":        row["name_bn"],
            "subtitle_bn":    row["subtitle_bn"],
            "active":         row["active"],
            "total_questions": row["total_questions"],
            "q_mcq":          row["q_mcq"],
            "q_match_pairs":  row["q_match_pairs"],
            "q_true_false":   row["q_true_false"],
            "q_tap_sequence": row["q_tap_sequence"],
            "q_categorize":   row["q_categorize"],
            "q_short_write":  row["q_short_write"],
            "ready_for_exam": row["ready_for_exam"],
        })

    # Flatten to list form
    result = []
    for cls in sorted(tree.values(), key=lambda x: x["class_id"]):
        subjects = []
        for subj in sorted(cls["subjects"].values(), key=lambda x: x["subject_id"]):
            books = []
            for book in sorted(subj["books"].values(), key=lambda x: x["book_id"]):
                book["chapters"].sort(key=lambda c: c["chapter_number"])
                books.append(book)
            subj["books"] = books
            subjects.append(subj)
        cls["subjects"] = subjects
        result.append(cls)

    return {"tree": result}


@router.post("/curriculum/seed-book")
def seed_book(body: SeedBookRequest, admin: dict = Depends(require_admin)):
    """
    Create a new book with its chapters from a chapters JSON.
    - Finds or creates the subject (by name + class).
    - Inserts the book (idempotent: skips if book_id_code already exists).
    - Inserts chapters (idempotent: skips existing chapter_numbers).
    Returns counts of what was created vs skipped.
    """
    supabase = get_supabase()

    # 1. Resolve class
    cls_res = (
        supabase.table("classes")
        .select("id")
        .eq("name", body.class_name)
        .single()
        .execute()
    )
    if not cls_res.data:
        raise HTTPException(status_code=404, detail=f"Class '{body.class_name}' not found. Valid values: 'Class 7', 'Class 8'")
    class_id = cls_res.data["id"]

    # 2. Find or create subject
    subj_res = (
        supabase.table("subjects")
        .select("id")
        .eq("name", body.subject_name)
        .eq("class_id", class_id)
        .execute()
    )
    if subj_res.data:
        subject_id = subj_res.data[0]["id"]
        subject_created = False
    else:
        new_subj = supabase.table("subjects").insert({
            "name":            body.subject_name,
            "display_name_bn": body.subject_display_bn,
            "subject_type":    "core",
            "class_id":        class_id,
        }).execute()
        subject_id = new_subj.data[0]["id"]
        subject_created = True

    # 3. Find or create book
    book_res = (
        supabase.table("books")
        .select("id")
        .eq("book_id_code", body.book_id_code)
        .execute()
    )
    if book_res.data:
        book_id = book_res.data[0]["id"]
        book_created = False
    else:
        new_book = supabase.table("books").insert({
            "subject_id":    subject_id,
            "book_id_code":  body.book_id_code,
            "title_bn":      body.title_bn,
            "total_chapters": body.total_chapters,
            "active":        True,
        }).execute()
        book_id = new_book.data[0]["id"]
        book_created = True

    # 4. Insert chapters (skip existing)
    existing_ch = (
        supabase.table("chapters")
        .select("chapter_number")
        .eq("book_id", book_id)
        .execute()
        .data
    )
    existing_numbers = {r["chapter_number"] for r in existing_ch}

    to_insert = []
    skipped   = []
    for ch in body.chapters:
        num = ch["chapter_number"]
        if num in existing_numbers:
            skipped.append(num)
            continue
        to_insert.append({
            "book_id":        book_id,
            "chapter_number": num,
            "name_bn":        ch["name_bn"],
            "subtitle_bn":    ch.get("subtitle_bn"),
            "active":         True,
        })

    if to_insert:
        supabase.table("chapters").insert(to_insert).execute()

    return {
        "ok":              True,
        "subject_created": subject_created,
        "book_created":    book_created,
        "book_id_code":    body.book_id_code,
        "chapters_inserted": len(to_insert),
        "chapters_skipped":  len(skipped),
        "skipped_numbers":   skipped,
    }


@router.post("/curriculum/seed-questions")
def seed_questions(body: SeedQuestionsRequest, admin: dict = Depends(require_admin)):
    """
    Import questions from a single chapter questions JSON.
    - Resolves book by book_id_code, chapter by chapter_no.
    - Inserts all question types into the questions table.
    - Idempotent: skips existing question_codes.
    """
    supabase = get_supabase()

    BATCH_SIZE = 50

    # Resolve book
    book_res = (
        supabase.table("books")
        .select("id")
        .eq("book_id_code", body.book_id)
        .single()
        .execute()
    )
    if not book_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"Book '{body.book_id}' not found. Run seed-book first."
        )
    book_db_id = book_res.data["id"]

    # Resolve chapter
    ch_res = (
        supabase.table("chapters")
        .select("id")
        .eq("book_id", book_db_id)
        .eq("chapter_number", body.chapter_no)
        .single()
        .execute()
    )
    if not ch_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"Chapter {body.chapter_no} not found in book '{body.book_id}'. Run seed-book first."
        )
    chapter_id = ch_res.data["id"]

    # Get existing question codes for this chapter (idempotent)
    existing = (
        supabase.table("questions")
        .select("question_code")
        .eq("chapter_id", chapter_id)
        .execute()
        .data
    )
    existing_codes = {r["question_code"] for r in existing}

    # Build rows to insert
    rows   = []
    skipped = 0

    PART_MAP = {1: "part1", 2: "part2"}
    DIFF_MAP = {"easy": "Easy", "medium": "Medium", "hard": "Hard"}

    for q_type, questions in body.questions.items():
        for q in questions:
            code = f"{body.book_id}__{q['id']}"
            if code in existing_codes:
                skipped += 1
                continue

            row: dict[str, Any] = {
                "question_code": code,
                "chapter_id":    chapter_id,
                "q_type":        q_type,
                "q_part":        PART_MAP.get(q.get("part", 1), "part1"),
                "marks":         q["marks"],
                "marks_per_item": q.get("marks_per_item"),
                "difficulty":    DIFF_MAP.get(q.get("difficulty", "medium"), "Medium"),
                "topic_bn":      q.get("topic_bn", "").strip() or None,
                "question_bn":   q["question_bn"].strip(),
                "active":        True,
            }

            # Type-specific fields
            if q_type == "mcq":
                row["options"]        = q.get("options")
                row["correct_answer"] = q.get("correct_answer")

            elif q_type == "true_false":
                row["correct_answer"] = str(q.get("correct_answer", "")).lower()

            elif q_type == "match_pairs":
                row["pairs"] = q.get("pairs")

            elif q_type == "tap_sequence":
                row["items"]         = q.get("items")
                row["correct_order"] = q.get("correct_order")

            elif q_type == "categorize":
                row["categories"] = q.get("categories")

            elif q_type == "short_write":
                row["expected_answer"] = q.get("expected_answer")
                row["max_words"]       = q.get("max_words")
                row["answer_slot_id"]  = q.get("answer_slot_id")

            rows.append(row)

    # Batch insert
    inserted = 0
    errors   = []
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i: i + BATCH_SIZE]
        try:
            res = supabase.table("questions").insert(batch).execute()
            inserted += len(res.data)
        except Exception as e:
            errors.append(str(e))

    return {
        "ok":       len(errors) == 0,
        "book_id":  body.book_id,
        "chapter":  body.chapter_no,
        "inserted": inserted,
        "skipped":  skipped,
        "errors":   errors,
    }


@router.delete("/curriculum/book/{book_id_code}")
def delete_book(book_id_code: str, admin: dict = Depends(require_admin)):
    """
    Remove a book and all its chapters + questions (cascade).
    Use with caution — also removes any exam sessions referencing those chapters.
    """
    supabase = get_supabase()

    book_res = (
        supabase.table("books")
        .select("id, title_bn")
        .eq("book_id_code", book_id_code)
        .single()
        .execute()
    )
    if not book_res.data:
        raise HTTPException(status_code=404, detail=f"Book '{book_id_code}' not found")

    book_id = book_res.data["id"]
    title   = book_res.data["title_bn"]

    supabase.table("books").delete().eq("id", book_id).execute()

    return {"ok": True, "deleted_book": book_id_code, "title_bn": title}
