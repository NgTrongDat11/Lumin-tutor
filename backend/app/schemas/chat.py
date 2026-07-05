"""Schemas for the student AI chat endpoint."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ChatMessageItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("Nội dung tin nhắn không được để trống.")
        return content


class ChatSendRequest(BaseModel):
    messages: list[ChatMessageItem] = Field(default_factory=list, max_length=50)
    message: str = Field(min_length=1, max_length=4000)

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        message = value.strip()
        if not message:
            raise ValueError("Tin nhắn không được để trống.")
        return message


class ChatSendResponse(BaseModel):
    reply: str
    created_at: datetime
