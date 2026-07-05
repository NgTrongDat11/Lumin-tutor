"""LearningSession model — maps to learning_sessions table."""

from datetime import date, time

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class LearningSession(Base, TimestampMixin):
    __tablename__ = "learning_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    private_request_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("private_tutoring_requests.id")
    )
    class_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("course_classes.id"))
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    session_number: Mapped[int | None] = mapped_column(Integer)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="SCHEDULED")
    attendance_note: Mapped[str | None] = mapped_column(Text)
