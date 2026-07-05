import re
from typing import Annotated
from pydantic import BaseModel, Field, AfterValidator, field_validator

def _validate_email(v: str) -> str:
    v = v.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
        raise ValueError("value is not a valid email address")
    return v

EmailStr = Annotated[str, AfterValidator(_validate_email)]



# ── Request schemas ──────────────────────────────────────


class RegisterStudentRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    address: str = Field(min_length=1)
    birth_year: int | None = None
    school: str | None = None
    academic_level: str = Field(min_length=1)

    @field_validator("address", "academic_level")
    @classmethod
    def must_not_be_blank(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("Không được để trống trường này.")
        return value.strip()


class RegisterTutorRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    address: str | None = None
    birth_year: int | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdatePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


# ── Response schemas ─────────────────────────────────────


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    full_name: str
    phone: str | None
    address: str | None
    birth_year: int | None
    avatar_url: str | None = None
    status: str
    school: str | None = None
    academic_level: str | None = None
    learning_style: str | None = None
    parent_notes: str | None = None

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None
    birth_year: int | None = None
    school: str | None = None
    academic_level: str | None = None
    learning_style: str | None = None
    parent_notes: str | None = None


class TutorProfileBrief(BaseModel):
    id: int
    verification_status: str
    teaching_mode: str
    teaching_area: str | None

    model_config = {"from_attributes": True}


class MeResponse(BaseModel):
    """Response for GET /auth/me — includes tutor profile if role is TUTOR."""

    user: UserResponse
    tutor_profile: TutorProfileBrief | None = None
