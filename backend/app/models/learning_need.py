"""LearningNeed model — maps to learning_needs table."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class LearningNeed(Base, TimestampMixin):
    __tablename__ = "learning_needs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    student_account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id"), nullable=False
    )
    subject_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("subjects.id"))
    grade_level: Mapped[str | None] = mapped_column(String(100))
    goal: Mapped[str | None] = mapped_column(Text)
    budget_per_session_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_per_session_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    preferred_mode: Mapped[str] = mapped_column(String(30), server_default="BOTH")
    preferred_learning_type: Mapped[str] = mapped_column(String(30), server_default="BOTH")
    preferred_area: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str | None] = mapped_column(Text)
    parsed_data: Mapped[str | None] = mapped_column(Text)
    parser_source: Mapped[str] = mapped_column(String(30), nullable=False, server_default="FORM")
    parsed_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="ACTIVE")
    recommendation_snapshot: Mapped[str | None] = mapped_column(Text)
    recommendation_updated_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    schedules: Mapped[list["LearningNeedSchedule"]] = relationship(
        "LearningNeedSchedule", back_populates="learning_need", cascade="all, delete-orphan"
    )
    subject: Mapped["Subject | None"] = relationship("Subject", lazy="selectin")
