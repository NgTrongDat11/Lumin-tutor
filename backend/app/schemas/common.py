"""Shared response wrapper following BD-1015: { data, message }."""

from typing import Any

from pydantic import BaseModel


class ApiResponse(BaseModel):
    data: Any = None
    message: str = "Thành công"
