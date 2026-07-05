"""LearningNeedSchedule model — maps to learning_need_schedules table."""

from datetime import datetime, time

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LearningNeedSchedule(Base):
    __tablename__ = "learning_need_schedules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    learning_need_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("learning_needs.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    time_slot: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    learning_need: Mapped["LearningNeed"] = relationship(
        "LearningNeed", back_populates="schedules"
    )
