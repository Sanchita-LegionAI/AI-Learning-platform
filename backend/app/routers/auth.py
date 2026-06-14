"""
core/auth.py
Validates Supabase JWT on every protected route.
Extracts user_id and role from the token.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import get_settings

bearer_scheme = HTTPBearer()


def _decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
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
    """
    Dependency: validates JWT, returns dict with user_id and role.
    Usage: user = Depends(get_current_user)
    """
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")

    # Supabase stores app_metadata in the token
    role = (
        payload.get("app_metadata", {}).get("role")
        or payload.get("user_metadata", {}).get("role")
        or "student"
    )

    return {"user_id": user_id, "role": role, "token": credentials.credentials}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: only allows admin role."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_student(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: allows student or admin."""
    if user["role"] not in ("student", "admin"):
        raise HTTPException(status_code=403, detail="Student access required")
    return user
