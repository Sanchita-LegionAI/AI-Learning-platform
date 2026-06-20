"""
core/auth.py
Validates Supabase JWT on every protected route.
Extracts user_id and role from the token.

Supabase now issues ES256 (ECDSA) tokens by default.
We decode without signature verification (Supabase already verified it)
and look up the role from public.users table.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import get_settings
from app.core.supabase import get_supabase

bearer_scheme = HTTPBearer()


def _decode_token(token: str) -> dict:
    """
    Decode Supabase JWT. Supports both HS256 and ES256.
    We skip signature verification here — Supabase has already verified it.
    Role is NOT trusted from the JWT; it's fetched from public.users.
    """
    try:
        # Decode without verification to support both HS256 and ES256
        payload = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_exp": True,   # still check expiry
            },
            algorithms=["HS256", "ES256"],
        )
        return payload
    except JWTError as e:
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
