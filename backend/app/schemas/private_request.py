"""Schemas for private tutoring requests."""

from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, Field


class PrivateRequestCreate(BaseModel):
    tutor_id: int
    learning_need_id: int | None = None
    subject_id: int
    grade_level: str = Field(max_length=100)
    goal: str | None = None
    requested_sessions: int = Field(gt=0)
    mode: str = "ONLINE"


class TutorConfirmRequest(BaseModel):
    agreed_fee_per_session: Decimal = Field(gt=0)
    agreed_sessions: int | None = Field(default=None, gt=0)
    class_title: str | None = Field(default=None, max_length=200)
    response_note: str | None = None
    location: str | None = Field(default=None, max_length=500)
    schedules: list["PrivateRequestScheduleCreate"] | None = None


class TutorRejectRequest(BaseModel):
    response_note: str | None = None


class UpdateLocationRequest(BaseModel):
    location: str = Field(max_length=500)


class PrivateRequestScheduleCreate(BaseModel):
    day_of_week: int = Field(ge=1, le=7)
    start_time: time
    end_time: time
    start_date: date
    end_date: date | None = None
    total_sessions: int | None = Field(default=None, gt=0)


class PrivateRequestScheduleResponse(BaseModel):
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


class PrivateRequestResponse(BaseModel):
    id: int
    student_account_id: int
    tutor_id: int
    learning_need_id: int | None
    subject_id: int
    grade_level: str
    goal: str | None
    requested_sessions: int
    agreed_fee_per_session: Decimal | None
    mode: str
    status: str
    tutor_response_note: str | None
    confirmed_at: datetime | None

    # Enriched fields
    thread_id: int | None = None
    tutor_name: str | None = None
    tutor_avatar_url: str | None = None
    tutor_phone: str | None = None
    tutor_address: str | None = None
    student_name: str | None = None
    student_avatar_url: str | None = None
    student_phone: str | None = None
    student_address: str | None = None
    subject_name: str | None = None
    class_location: str | None = None
    schedules: list[PrivateRequestScheduleResponse] = []

    model_config = {"from_attributes": True}
