"""TutorQualification model — maps to tutor_qualifications table."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TutorQualification(Base, TimestampMixin):
    __tablename__ = "tutor_qualifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="PENDING")
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    tutor: Mapped["TutorProfile"] = relationship(
        "TutorProfile", back_populates="qualifications"
    )
