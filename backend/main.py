"""
main.py
=======
FastAPI application entry point.
Mounts all routers, configures CORS, adds health check.

Run locally:
    uvicorn main:app --reload --port 8000

Production (Railway):
    uvicorn main:app --host 0.0.0.0 --port $PORT
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.routers import auth, curriculum, exam, admin

settings = get_settings()

app = FastAPI(
    title="Bengali AI Learning Platform API",
    description="Backend for Bengali-medium exam tutor app",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
)

# =============================================================================
# CORS
# =============================================================================
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# ROUTERS
# =============================================================================
app.include_router(auth.router)
app.include_router(curriculum.router)
app.include_router(exam.router)
app.include_router(admin.router)


# =============================================================================
# HEALTH CHECK
# =============================================================================
@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
