"""
core/config.py
All settings loaded from environment variables via pydantic-settings.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str          # bypasses RLS — backend only, never expose
    SUPABASE_JWT_SECRET: str           # from Supabase Dashboard → Settings → API

    # OpenAI
    OPENAI_API_KEY: str = ""

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "exam-answers"
    R2_PUBLIC_URL: str = ""            # optional public bucket URL

    # App
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173"  # comma-separated
    DAILY_EXAM_LIMIT: int = 10
    INR_PER_USD: float = 84.0          # for cost logging
    IMAGE_EXPIRY_SECONDS: int = 3600   # signed URL validity (1 hour)

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
