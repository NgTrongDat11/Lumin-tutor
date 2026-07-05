"""TutorAvailability model — maps to tutor_availabilities table."""

from datetime import time

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TutorAvailability(Base, TimestampMixin):
    __tablename__ = "tutor_availabilities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    mode: Mapped[str] = mapped_column(String(30), nullable=False, server_default="BOTH")

    # Relationships
    tutor: Mapped["TutorProfile"] = relationship("TutorProfile", back_populates="availabilities")
