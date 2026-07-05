"""Staff verification schemas."""

from pydantic import BaseModel


class ReviewAction(BaseModel):
    """Staff review action for qualifications, subjects, and profiles."""
    action: str  # "APPROVED" | "REJECTED"
    review_note: str | None = None


class TutorProfileForStaff(BaseModel):
    id: int
    account_id: int
    full_name: str | None = None
    email: str | None = None
    bio: str | None
    qualification_level: str | None
    years_experience: int
    teaching_mode: str
    teaching_area: str | None
    verification_status: str
    account_status: str = "ACTIVE"

    model_config = {"from_attributes": True}
