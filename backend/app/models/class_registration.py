"""ClassRegistration model — maps to class_registrations table."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ClassRegistration(Base, TimestampMixin):
    __tablename__ = "class_registrations"
    __table_args__ = (UniqueConstraint("class_id", "student_account_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("course_classes.id"), nullable=False)
    student_account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id"), nullable=False
    )
    learning_need_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("learning_needs.id"))
    status: Mapped[str] = mapped_column(String(40), nullable=False, server_default="PENDING")
    reviewed_by_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    review_note: Mapped[str | None] = mapped_column(Text)
