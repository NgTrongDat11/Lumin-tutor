"""SchedulePattern model — maps to schedule_patterns table."""

from datetime import date, time

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SchedulePattern(Base, TimestampMixin):
    __tablename__ = "schedule_patterns"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    private_request_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("private_tutoring_requests.id")
    )
    class_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("course_classes.id"))
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    total_sessions: Mapped[int | None] = mapped_column(Integer)
