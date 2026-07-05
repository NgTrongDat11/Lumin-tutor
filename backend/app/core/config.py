"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration read from .env file or environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────
    APP_NAME: str = "Lumin API"
    DEBUG: bool = False

    # ── Database ─────────────────────────────────────────
    DATABASE_URL: str  # e.g. postgresql+asyncpg://user:pass@host:port/db

    # ── JWT ──────────────────────────────────────────────
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ── CORS ─────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # ── AI / LLM (optional) ──────────────────────────────
    LLM_ENABLED: bool = False
    LLM_API_KEY: str = ""

    # ── AI / Gemini (optional) ───────────────────────────
    GEMINI_ENABLED: bool = False
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"

    # ── Storage (S3) ─────────────────────────────────────
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = ""
    S3_PUBLIC_BASE_URL: str = ""
    SUPABASE_URL: str = ""

    # ── Payment / SePay ─────────────────────────────────
    PAYMENT_PROVIDER: str = "mock"
    SEPAY_BANK_ACCOUNT: str = ""
    SEPAY_BANK_NAME: str = ""
    SEPAY_ACCOUNT_NAME: str = ""
    SEPAY_WEBHOOK_API_KEY: str = ""
    SEPAY_TEST_AMOUNT: int = 0
    PAYMENT_AMOUNT_DIVISOR: int = 1
    PAYMENT_EXPIRES_MINUTES: int = 30

    def get_async_db_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

settings = Settings()  # type: ignore[call-arg]
