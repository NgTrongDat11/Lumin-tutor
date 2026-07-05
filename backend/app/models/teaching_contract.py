"""TeachingContract model — maps to teaching_contracts table."""

from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TeachingContract(Base, TimestampMixin):
    __tablename__ = "teaching_contracts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tutor_profiles.id"), nullable=False)
    private_request_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("private_tutoring_requests.id")
    )
    class_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("course_classes.id"))
    commission_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    center_rate_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    tutor_rate_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="PENDING")
