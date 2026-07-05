"""Pydantic schemas for contextual user messaging."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_serializer, model_validator


def _serialize_utc_datetime(value: datetime) -> str:
    """Return an ISO timestamp with an explicit UTC marker for browser parsing."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


class MessageParticipantResponse(BaseModel):
    account_id: int
    full_name: str
    role: str


class MessageResponse(BaseModel):
    id: int
    thread_id: int
    sender_id: int
    sender_name: str | None = None
    content: str
    created_at: datetime
    is_mine: bool = False

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, value: datetime) -> str:
        return _serialize_utc_datetime(value)

    model_config = {"from_attributes": True}


class MessageThreadResponse(BaseModel):
    id: int
    private_request_id: int | None = None
    class_id: int | None = None
    class_registration_id: int | None = None
    title: str | None = None
    status: str
    participants: list[MessageParticipantResponse] = Field(default_factory=list)
    last_message: MessageResponse | None = None
    messages: list[MessageResponse] = Field(default_factory=list)
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", when_used="json")
    def serialize_thread_datetime(self, value: datetime) -> str:
        return _serialize_utc_datetime(value)

    model_config = {"from_attributes": True}


class MessageThreadEnsureRequest(BaseModel):
    private_request_id: int | None = None
    class_id: int | None = None
    class_registration_id: int | None = None
    support: bool = False
    target_account_id: int | None = None
    title: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_context(self) -> "MessageThreadEnsureRequest":
        context_count = sum(
            value is not None
            for value in (self.private_request_id, self.class_id, self.class_registration_id)
        )
        if self.target_account_id is not None:
            if self.support:
                raise ValueError("Không thể thiết lập cả target_account_id và support.")
            if context_count:
                raise ValueError("Direct message không gắn với lớp/yêu cầu cụ thể.")
        elif self.support:
            if context_count:
                raise ValueError("Support thread không gắn với lớp/yêu cầu cụ thể.")
        elif context_count != 1:
            raise ValueError("Thread phải gắn với đúng một ngữ cảnh nghiệp vụ hoặc một người nhận.")
        return self


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
