"""
routers/auth.py
POST /api/auth/verify  — validate JWT, return user profile + role
"""
from fastapi import APIRouter, Depends
from app.core.auth import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/verify")
def verify_token(user: dict = Depends(get_current_user)):
    """Validate JWT and return user profile."""
    supabase = get_supabase()
    res = (
        supabase.table("users")
        .select("id, display_name, role, class_preference, created_at, last_active")
        .eq("id", user["user_id"])
        .single()
        .execute()
    )
    profile = res.data or {}
    supabase.table("users").update({"last_active": "now()"}).eq("id", user["user_id"]).execute()
    return {
        "user_id": user["user_id"],
        "role": user["role"],
        "profile": profile,
    }
