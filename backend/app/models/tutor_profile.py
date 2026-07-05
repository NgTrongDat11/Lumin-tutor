"""TutorProfile model — maps to tutor_profiles table."""

from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TutorProfile(Base, TimestampMixin):
    __tablename__ = "tutor_profiles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id"), unique=True, nullable=False
    )
    bio: Mapped[str | None] = mapped_column(Text)
    qualification_level: Mapped[str | None] = mapped_column(String(50))
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    teaching_mode: Mapped[str] = mapped_column(String(30), nullable=False, server_default="BOTH")
    teaching_area: Mapped[str | None] = mapped_column(Text)

    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="DRAFT"
    )
    average_rating: Mapped[Decimal] = mapped_column(
        Numeric(3, 2), nullable=False, server_default="0"
    )
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Relationships
    account: Mapped["UserAccount"] = relationship(
        "UserAccount", back_populates="tutor_profile", lazy="selectin"
    )
    qualifications: Mapped[list["TutorQualification"]] = relationship(
        "TutorQualification", back_populates="tutor", lazy="selectin"
    )
    subjects: Mapped[list["TutorSubject"]] = relationship(
        "TutorSubject", back_populates="tutor", lazy="selectin"
    )
    availabilities: Mapped[list["TutorAvailability"]] = relationship(
        "TutorAvailability", back_populates="tutor", lazy="selectin"
    )
