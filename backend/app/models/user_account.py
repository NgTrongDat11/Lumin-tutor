"""UserAccount model — maps to user_accounts table."""

from sqlalchemy import BigInteger, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserAccount(Base, TimestampMixin):
    __tablename__ = "user_accounts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(Text)
    birth_year: Mapped[int | None] = mapped_column(Integer)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")
    school: Mapped[str | None] = mapped_column(String(255))
    academic_level: Mapped[str | None] = mapped_column(String(100))
    learning_style: Mapped[str | None] = mapped_column(Text)
    parent_notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    tutor_profile: Mapped["TutorProfile | None"] = relationship(
        "TutorProfile", back_populates="account", uselist=False, lazy="selectin"
    )
