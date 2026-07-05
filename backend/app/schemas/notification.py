"""Pydantic schemas for notifications."""

from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    notification_type: str
    title: str
    body: str | None = None
    reference_type: str | None = None
    reference_id: int | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationUnreadCount(BaseModel):
    count: int
