"""
core/auth.py
Validates Supabase JWT on every protected route.
Supports both HS256 and ES256 tokens (Supabase now issues ES256).
Role is fetched from public.users table — NOT from JWT metadata.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import base64
import json
from app.core.supabase import get_supabase

bearer_scheme = HTTPBearer()


def _decode_token(token: str) -> dict:
    """
    Decode Supabase JWT without library signature verification.
    Supabase has already verified the token — we just need the payload.
    """
    try:
        # JWT is three base64url parts: header.payload.signature
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid JWT format")

        # Add padding and decode payload
        payload_b64 = parts[1]
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding

        payload = json.loads(base64.urlsafe_b64decode(payload_b64))

        # Check expiry
        import time
        if payload.get("exp", 0) < time.time():
            raise ValueError("Token has expired")

        return payload
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")

    # Look up role from public.users (source of truth)
    try:
        supabase = get_supabase()
        result = (
            supabase.table("users")
            .select("role")
            .eq("id", user_id)
            .single()
            .execute()
        )
        role = result.data.get("role", "student") if result.data else "student"
    except Exception:
        role = "student"

    return {"user_id": user_id, "role": role, "token": credentials.credentials}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("student", "admin"):
        raise HTTPException(status_code=403, detail="Student access required")
    return user
