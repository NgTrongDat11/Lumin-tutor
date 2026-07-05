"""FastAPI application entry point."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.auth import router as auth_router
from app.api.v1.tutor import router as tutor_router
from app.api.v1.staff import router as staff_router
from app.api.v1.learning_needs import router as learning_needs_router
from app.api.v1.recommendations import router as recommendations_router
from app.api.v1.private_requests import router as private_requests_router
from app.api.v1.classes import router as classes_router
from app.api.v1.payments import router as payments_router
from app.api.v1.subjects import router as subjects_router
from app.api.v1.schedules import router as schedules_router
from app.api.v1.storage import router as storage_router
from app.api.v1.chat import router as chat_router
from app.api.v1.messages import router as messages_router
from app.api.v1.admin import router as admin_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.finance import router as finance_router
from app.api.v1.tutor_income import router as tutor_income_router
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────
API_V1 = "/api/v1"

app.include_router(auth_router, prefix=API_V1)
app.include_router(tutor_router, prefix=API_V1)
app.include_router(staff_router, prefix=API_V1)
app.include_router(learning_needs_router, prefix=API_V1)
app.include_router(recommendations_router, prefix=API_V1)
app.include_router(private_requests_router, prefix=API_V1)
app.include_router(classes_router, prefix=API_V1)
app.include_router(payments_router, prefix=API_V1)
app.include_router(webhooks_router, prefix=API_V1)
app.include_router(subjects_router, prefix=API_V1)
app.include_router(schedules_router, prefix=API_V1)
app.include_router(admin_router, prefix=API_V1)
app.include_router(chat_router, prefix=API_V1)
app.include_router(messages_router, prefix=API_V1)
app.include_router(storage_router, prefix=API_V1)
app.include_router(notifications_router, prefix=API_V1)
app.include_router(finance_router, prefix=API_V1)
app.include_router(tutor_income_router, prefix=API_V1)

# Serve uploaded files locally
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

seed_dir = Path(__file__).resolve().parents[2] / "seed"
if seed_dir.exists():
    app.mount("/seed", StaticFiles(directory=seed_dir), name="seed")

# ── Startup hook ─────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    from app.db.session import async_session_factory
    from sqlalchemy import text
    async with async_session_factory() as session:
        async with session.begin():
            # Create system_settings table if it doesn't exist
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS system_settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value VARCHAR(255) NOT NULL
                );
            """))
            # Insert default config values if not present
            await session.execute(text("""
                INSERT INTO system_settings (key, value)
                VALUES ('commission_rate_center', '30'), ('commission_rate_tutor', '70')
                ON CONFLICT (key) DO NOTHING;
            """))

# ── Health ───────────────────────────────────────────────
@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "message": "Lumin API is running"}
