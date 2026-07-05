"""CourseClass model — maps to course_classes table."""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CourseClass(Base, TimestampMixin):
    __tablename__ = "course_classes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    private_request_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("private_tutoring_requests.id")
    )
    subject_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("subjects.id"), nullable=False)
    primary_tutor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("tutor_profiles.id")
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    grade_level: Mapped[str] = mapped_column(String(100), nullable=False)
    goal: Mapped[str | None] = mapped_column(Text)
    fee_per_session_per_student: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_sessions: Mapped[int] = mapped_column(Integer, nullable=False)
    min_students: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    max_students: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(30), nullable=False, server_default="OFFLINE")
    location: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(40), nullable=False, server_default="DRAFT")
    created_by_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id")
    )

    schedules: Mapped[list["SchedulePattern"]] = relationship(
        "SchedulePattern",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
