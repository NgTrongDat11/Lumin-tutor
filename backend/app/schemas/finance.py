"""Read-only finance reporting schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class FinanceReportRow(BaseModel):
    payment_id: int
    created_at: datetime
    paid_at: datetime | None
    payment_status: str
    provider: str
    sepay_transaction_id: str | None
    transfer_content: str | None
    student_account_id: int
    student_name: str
    tutor_id: int | None
    tutor_name: str | None
    contract_id: int | None
    target_type: str
    target_id: int
    target_name: str | None
    class_id: int | None
    subject_id: int | None
    subject_name: str | None
    billing_cycle_label: str | None
    gross_amount: Decimal
    refund_amount: Decimal
    refund_at: datetime | None
    refund_reason: str | None
    net_amount: Decimal
    center_rate: Decimal | None
    tutor_rate: Decimal | None
    center_gross: Decimal
    tutor_gross: Decimal
    center_refund_adjustment: Decimal
    tutor_refund_adjustment: Decimal
    center_net: Decimal
    tutor_net: Decimal
    allocation_status: str


class FinanceSummary(BaseModel):
    gross_amount: Decimal
    refund_amount: Decimal
    net_amount: Decimal
    center_net: Decimal
    tutor_net: Decimal
    unallocated_net: Decimal
    transaction_count: int
    recognized_count: int
    missing_snapshot_count: int


class TutorIncomeSummary(BaseModel):
    this_month: Decimal
    this_year: Decimal
    total: Decimal
    refund_adjustment: Decimal
    transaction_count: int


class TutorIncomeTransaction(BaseModel):
    payment_id: int
    paid_at: datetime | None
    refund_at: datetime | None
    target_type: str
    target_name: str | None
    subject_name: str | None
    billing_cycle_label: str | None
    payment_status: str
    gross_amount: Decimal
    refund_amount: Decimal
    tutor_rate: Decimal | None
    tutor_gross: Decimal
    tutor_refund_adjustment: Decimal
    tutor_net: Decimal
