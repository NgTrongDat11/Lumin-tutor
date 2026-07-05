"""Schemas for payments and reviews."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


# ── Payment ──────────────────────────────────────────────


class PaymentResponse(BaseModel):
    id: int
    student_account_id: int
    target_type: str
    target_id: int
    contract_id: int | None
    amount: Decimal
    currency: str
    status: str
    provider: str | None = None
    billing_cycle_label: str | None = None
    center_amount_snapshot: Decimal | None = None
    tutor_amount_snapshot: Decimal | None = None
    paid_at: datetime | None
    created_at: datetime
    refund_amount: Decimal | None
    refund_reason: str | None
    transfer_content: str | None = None
    qr_data_url: str | None = None
    expires_at: datetime | None = None
    sepay_transaction_id: str | None = None

    # SePay display data
    qr_amount: int | None = None
    display_amount: int | None = None
    bank_info: dict[str, Any] | None = None
    is_test_mode: bool = False
    amount_divisor: int = 1
    
    # Enriched data
    target_name: str | None = None
    tutor_name: str | None = None
    subject_name: str | None = None

    model_config = {"from_attributes": True}


class PaymentRefund(BaseModel):
    refund_amount: Decimal = Field(gt=0)
    refund_reason: str | None = None


class SepayWebhookPayload(BaseModel):
    id: int | None = None
    gateway: str | None = None
    transactionDate: str | None = None
    accountNumber: str | None = None
    subAccount: str | None = None
    code: str | None = None
    content: str | None = None
    transferType: str | None = None
    transferAmount: float | None = None
    accumulated: float | None = None
    referenceCode: str | None = None
    description: str | None = None

    model_config = {"extra": "allow"}


class PaymentStatusResponse(BaseModel):
    payment_id: int
    status: str
    paid_at: datetime | None = None


# ── Review ───────────────────────────────────────────────


class ReviewCreate(BaseModel):
    tutor_id: int
    target_type: str  # PRIVATE_TUTORING_REQUEST | CLASS_REGISTRATION
    target_id: int
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class ReviewResponse(BaseModel):
    id: int
    student_account_id: int
    tutor_id: int
    target_type: str
    target_id: int
    rating: int
    comment: str | None
    created_at: datetime | None = None

    # Enriched data
    tutor_name: str | None = None
    tutor_avatar_url: str | None = None
    subject_name: str | None = None

    model_config = {"from_attributes": True}
