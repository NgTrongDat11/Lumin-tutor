"""TutorApplication model — maps to tutor_applications table."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TutorApplication(Base, TimestampMixin):
    __tablename__ = "tutor_applications"
    __table_args__ = (UniqueConstraint("class_id", "tutor_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_classes.id"), nullable=False)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="APPLIED")
    message: Mapped[str | None] = mapped_column(Text)
    reviewed_by_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
