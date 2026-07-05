"""PrivateTutoringRequest model — maps to private_tutoring_requests table."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PrivateTutoringRequest(Base, TimestampMixin):
    __tablename__ = "private_tutoring_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    student_account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id"), nullable=False
    )
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor_profiles.id"), nullable=False
    )
    learning_need_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("learning_needs.id")
    )
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id"), nullable=False)
    grade_level: Mapped[str] = mapped_column(String(100), nullable=False)
    goal: Mapped[str | None] = mapped_column(Text)
    requested_sessions: Mapped[int] = mapped_column(Integer, nullable=False)
    agreed_fee_per_session: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    mode: Mapped[str] = mapped_column(String(30), nullable=False, server_default="ONLINE")
    status: Mapped[str] = mapped_column(String(40), nullable=False, server_default="SENT")
    tutor_response_note: Mapped[str | None] = mapped_column(Text)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
