"""Pydantic schemas for tutor profile, qualifications, subjects, availabilities."""

from datetime import time
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


# ── Tutor Profile ────────────────────────────────────────


class TutorProfileUpdate(BaseModel):
    bio: str | None = None
    qualification_level: str | None = None
    years_experience: int | None = None
    teaching_mode: str | None = None
    teaching_area: str | None = None


class TutorProfileResponse(BaseModel):
    id: int
    account_id: int
    bio: str | None
    qualification_level: str | None
    years_experience: int
    teaching_mode: str
    teaching_area: str | None
    verification_status: str
    average_rating: Decimal
    rating_count: int

    model_config = {"from_attributes": True}


class TutorPublicResponse(BaseModel):
    """Public-facing tutor info for recommendation results."""

    id: int
    full_name: str
    avatar_url: str | None = None
    bio: str | None
    qualification_level: str | None
    years_experience: int
    teaching_mode: str
    teaching_area: str | None
    verification_status: str
    average_rating: Decimal
    rating_count: int
    subjects: list["TutorSubjectResponse"] = Field(default_factory=list)
    availabilities: list["TutorAvailabilityResponse"] = Field(default_factory=list)
    qualifications: list["QualificationResponse"] = Field(default_factory=list)


# ── Qualifications ───────────────────────────────────────


class QualificationCreate(BaseModel):
    type: str
    title: str = Field(max_length=255)
    issuer: str | None = None
    file_url: str


class QualificationResponse(BaseModel):
    id: int
    type: str
    title: str
    issuer: str | None
    file_url: str
    status: str
    review_note: str | None

    model_config = {"from_attributes": True}


# ── Tutor Subjects ───────────────────────────────────────


class TutorSubjectCreate(BaseModel):
    subject_id: int
    grade_level: str = Field(max_length=100)
    fee_per_session: Decimal = Field(gt=0)


class TutorSubjectResponse(BaseModel):
    id: int
    subject_id: int
    subject_name: str | None = None
    grade_level: str
    fee_per_session: Decimal
    status: str

    model_config = {"from_attributes": True}


# ── Availabilities ───────────────────────────────────────


class AvailabilityCreate(BaseModel):
    day_of_week: int = Field(ge=1, le=7)
    start_time: time
    end_time: time
    mode: str = "BOTH"

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.start_time >= self.end_time:
            raise ValueError("Giờ kết thúc phải sau giờ bắt đầu.")
        return self


class TutorAvailabilityResponse(BaseModel):
    id: int
    day_of_week: int
    start_time: time
    end_time: time
    mode: str

    model_config = {"from_attributes": True}


# Rebuild forward refs
TutorPublicResponse.model_rebuild()
