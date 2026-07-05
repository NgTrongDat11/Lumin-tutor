"""Payment model — maps to payments table."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    student_account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_accounts.id"), nullable=False
    )
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    contract_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("teaching_contracts.id")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, server_default="VND")
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="CREATED")
    provider: Mapped[str] = mapped_column(String(30), nullable=False, server_default="MOCK")
    provider_ref: Mapped[str | None] = mapped_column(String(255))
    billing_cycle_label: Mapped[str | None] = mapped_column(String(100))
    center_amount_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    tutor_amount_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    refund_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    refund_reason: Mapped[str | None] = mapped_column(Text)
    transfer_content: Mapped[str | None] = mapped_column(String(100))
    qr_data_url: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    sepay_transaction_id: Mapped[str | None] = mapped_column(String(255))
