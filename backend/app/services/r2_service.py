"""
services/r2_service.py
======================
Handles all Cloudflare R2 operations:
- Upload answer sheet images
- Generate pre-signed URLs for vision LLM access
- Images auto-delete after 30 days (via R2 lifecycle rule + DB timestamp)
"""
import boto3
import uuid
from datetime import datetime, timedelta, timezone
from botocore.config import Config
from app.core.config import get_settings


def _get_r2_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def upload_answer_image(
    session_id: str,
    user_id: str,
    image_bytes: bytes,
    content_type: str = "image/jpeg",
) -> tuple[str, str, datetime]:
    """
    Upload an answer sheet image to R2.

    Returns:
        object_key: R2 key (for re-signing later)
        signed_url: pre-signed URL valid for IMAGE_EXPIRY_SECONDS
        expires_at: datetime when the signed URL expires
    """
    settings = get_settings()
    client = _get_r2_client()

    # Key structure: answers/{user_id}/{session_id}/{uuid}.jpg
    ext = "jpg" if "jpeg" in content_type else content_type.split("/")[-1]
    object_key = f"answers/{user_id}/{session_id}/{uuid.uuid4().hex}.{ext}"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=object_key,
        Body=image_bytes,
        ContentType=content_type,
    )

    signed_url, expires_at = generate_signed_url(object_key)
    return object_key, signed_url, expires_at


def generate_signed_url(object_key: str) -> tuple[str, datetime]:
    """
    Generate a fresh pre-signed URL for an existing R2 object.
    Called when the stored URL has expired.

    Returns:
        signed_url: new pre-signed URL
        expires_at: datetime when it expires
    """
    settings = get_settings()
    client = _get_r2_client()

    expiry = settings.IMAGE_EXPIRY_SECONDS
    signed_url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.R2_BUCKET_NAME, "Key": object_key},
        ExpiresIn=expiry,
    )
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expiry)
    return signed_url, expires_at


def delete_image(object_key: str) -> bool:
    """Delete an image from R2 (called by cleanup job or on user request)."""
    settings = get_settings()
    try:
        client = _get_r2_client()
        client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=object_key)
        return True
    except Exception:
        return False


def get_fresh_url_if_expired(
    object_key: str,
    current_url: str,
    expires_at: datetime,
) -> tuple[str, datetime]:
    """
    Check if the stored signed URL is still valid.
    If expired (or about to expire within 5 min), generate a fresh one.
    """
    now = datetime.now(timezone.utc)
    if expires_at and (expires_at - now).total_seconds() > 300:
        return current_url, expires_at
    return generate_signed_url(object_key)
