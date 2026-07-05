"""ScheduleBlock model — maps to schedule_blocks table."""

from datetime import time

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ScheduleBlock(Base, TimestampMixin):
    __tablename__ = "schedule_blocks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    private_request_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("private_tutoring_requests.id")
    )
    class_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("course_classes.id"))
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="ACTIVE")
