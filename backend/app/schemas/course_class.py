"""Schemas for course classes, tutor applications, and student registrations."""

from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, Field


# ── Schedule Pattern schemas for Course Class ────────────

class ClassSchedulePatternCreate(BaseModel):
    day_of_week: int = Field(ge=1, le=7)
    start_time: time
    end_time: time
    start_date: date | None = None
    end_date: date | None = None
    total_sessions: int | None = None


class ClassSchedulePatternResponse(BaseModel):
    id: int
    day_of_week: int
    start_time: time
    end_time: time
    start_date: date | None = None
    end_date: date | None = None
    total_sessions: int | None = None

    model_config = {"from_attributes": True}


# ── Course Class ─────────────────────────────────────────


class CourseClassCreate(BaseModel):
    subject_id: int
    title: str = Field(max_length=255)
    grade_level: str = Field(max_length=100)
    goal: str | None = None
    fee_per_session_per_student: Decimal = Field(gt=0)
    total_sessions: int = Field(gt=0)
    min_students: int = Field(ge=1, default=1)
    max_students: int = Field(ge=1)
    mode: str = "OFFLINE"
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    schedules: list[ClassSchedulePatternCreate] | None = None


class CourseClassUpdate(BaseModel):
    subject_id: int | None = None
    title: str | None = Field(default=None, max_length=255)
    grade_level: str | None = Field(default=None, max_length=100)
    goal: str | None = None
    fee_per_session_per_student: Decimal | None = Field(default=None, gt=0)
    total_sessions: int | None = Field(default=None, gt=0)
    min_students: int | None = Field(default=None, ge=1)
    max_students: int | None = Field(default=None, ge=1)
    mode: str | None = None
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    primary_tutor_id: int | None = None
    schedules: list[ClassSchedulePatternCreate] | None = None


class CourseClassResponse(BaseModel):
    id: int
    private_request_id: int | None = None
    subject_id: int
    primary_tutor_id: int | None
    title: str
    grade_level: str
    goal: str | None
    fee_per_session_per_student: Decimal
    total_sessions: int
    min_students: int
    max_students: int
    mode: str
    location: str | None
    start_date: date | None = None
    end_date: date | None = None
    status: str
    created_by_account_id: int | None
    schedules: list[ClassSchedulePatternResponse] = []

    # Enriched
    tutor_name: str | None = None
    tutor_avatar_url: str | None = None
    subject_name: str | None = None

    model_config = {"from_attributes": True}


# ── Tutor Application ───────────────────────────────────


class TutorApplicationCreate(BaseModel):
    message: str | None = None


class TutorApplicationResponse(BaseModel):
    id: int
    class_id: int
    tutor_id: int
    status: str
    message: str | None
    class_title: str | None = None
    class_status: str | None = None
    grade_level: str | None = None
    total_sessions: int | None = None
    fee_per_session_per_student: Decimal | None = None
    mode: str | None = None
    location: str | None = None
    subject_name: str | None = None

    model_config = {"from_attributes": True}


# ── Class Registration ───────────────────────────────────


class ClassRegistrationCreate(BaseModel):
    learning_need_id: int | None = None


class ClassRegistrationResponse(BaseModel):
    id: int
    class_id: int
    private_request_id: int | None = None
    student_account_id: int
    learning_need_id: int | None
    status: str
    review_note: str | None

    # Enriched
    class_title: str | None = None
    tutor_name: str | None = None
    tutor_avatar_url: str | None = None
    subject_name: str | None = None
    total_sessions: int | None = None
    fee_per_session_per_student: Decimal | None = None

    model_config = {"from_attributes": True}
