"""Schemas for schedules, sessions, and teaching contracts."""

from datetime import date, time, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── Schedule Pattern ─────────────────────────────────────


class SchedulePatternCreate(BaseModel):
    private_request_id: int | None = None
    class_id: int | None = None
    day_of_week: int = Field(ge=1, le=7)
    start_time: time
    end_time: time
    start_date: date
    end_date: date | None = None
    total_sessions: int | None = None


class SchedulePatternResponse(BaseModel):
    id: int
    private_request_id: int | None
    class_id: int | None
    day_of_week: int
    start_time: time
    end_time: time
    start_date: date
    end_date: date | None
    total_sessions: int | None

    model_config = {"from_attributes": True}


# ── Learning Session ─────────────────────────────────────


class LearningSessionResponse(BaseModel):
    id: int
    private_request_id: int | None
    class_id: int | None
    tutor_id: int
    session_number: int | None
    session_date: date
    start_time: time
    end_time: time
    status: str
    attendance_note: str | None

    # Enriched
    tutor_name: str | None = None
    class_title: str | None = None
    private_request_title: str | None = None
    mode: str | None = None
    location: str | None = None
    student_names: list[str] = Field(default_factory=list)
    student_count: int | None = None
    target_total_sessions: int | None = None
    target_goal: str | None = None

    model_config = {"from_attributes": True}


class SessionAttendanceUpdate(BaseModel):
    status: str  # COMPLETED, CANCELLED, NO_SHOW
    attendance_note: str | None = None


# ── Teaching Contract ────────────────────────────────────


class ContractCommissionUpdate(BaseModel):
    center_rate: Decimal = Field(ge=0, le=100)
    tutor_rate: Decimal = Field(ge=0, le=100)
    reason: str = Field(min_length=3, max_length=500)


class TeachingContractCreate(BaseModel):
    tutor_id: int
    private_request_id: int | None = None
    class_id: int | None = None
    commission_name_snapshot: str = "Default Commission"
    center_rate_snapshot: Decimal = Decimal("30.00")
    tutor_rate_snapshot: Decimal = Decimal("70.00")


class TeachingContractResponse(BaseModel):
    id: int
    tutor_id: int
    private_request_id: int | None
    class_id: int | None
    commission_name_snapshot: str
    center_rate_snapshot: Decimal
    tutor_rate_snapshot: Decimal
    status: str
    
    # Enriched data
    tutor_name: str | None = None
    target_name: str | None = None

    model_config = {"from_attributes": True}
