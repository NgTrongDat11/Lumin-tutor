"""TutorSubject model — maps to tutor_subjects table."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TutorSubject(Base, TimestampMixin):
    __tablename__ = "tutor_subjects"
    __table_args__ = (
        UniqueConstraint("tutor_id", "subject_id", "grade_level"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id"), nullable=False)
    grade_level: Mapped[str] = mapped_column(String(100), nullable=False)
    fee_per_session: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="PENDING")
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    tutor: Mapped["TutorProfile"] = relationship("TutorProfile", back_populates="subjects")
    subject: Mapped["Subject"] = relationship("Subject", lazy="selectin")
