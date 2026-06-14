"""
routers/curriculum.py
GET /api/curriculum          — full class → subject → book → chapter tree
GET /api/chapters/{book_id}  — chapters for a specific book
"""
from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/api", tags=["curriculum"])


@router.get("/curriculum")
def get_curriculum(user: dict = Depends(get_current_user)):
    """
    Returns full curriculum tree:
    classes → subjects → books → chapters
    Frontend uses this to build the selection dropdowns.
    """
    supabase = get_supabase()

    # Fetch all active classes
    classes = supabase.table("classes").select("*").eq("active", True).order("id").execute().data

    result = []
    for cls in classes:
        # Subjects for this class
        subjects = (
            supabase.table("subjects")
            .select("*")
            .eq("class_id", cls["id"])
            .eq("active", True)
            .order("id")
            .execute()
            .data
        )

        subjects_out = []
        for subject in subjects:
            # Books for this subject
            books = (
                supabase.table("books")
                .select("*")
                .eq("subject_id", subject["id"])
                .eq("active", True)
                .order("id")
                .execute()
                .data
            )

            books_out = []
            for book in books:
                # Chapters for this book
                chapters = (
                    supabase.table("chapters")
                    .select("id, chapter_number, name_bn, subtitle_bn, difficulty_avg, active")
                    .eq("book_id", book["id"])
                    .eq("active", True)
                    .order("chapter_number")
                    .execute()
                    .data
                )
                books_out.append({**book, "chapters": chapters})

            subjects_out.append({**subject, "books": books_out})

        result.append({**cls, "subjects": subjects_out})

    return {"curriculum": result}


@router.get("/chapters/{book_id}")
def get_chapters(book_id: int, user: dict = Depends(get_current_user)):
    """Chapters list for a specific book (used for lazy loading)."""
    supabase = get_supabase()
    res = (
        supabase.table("chapters")
        .select("id, chapter_number, name_bn, subtitle_bn, difficulty_avg")
        .eq("book_id", book_id)
        .eq("active", True)
        .order("chapter_number")
        .execute()
    )
    return {"chapters": res.data}
