"""Thin wrapper around the Google GenAI SDK for Lumin chat."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

from app.core.config import settings
from app.schemas.chat import ChatMessageItem


class GeminiServiceError(Exception):
    """Raised when Gemini cannot produce a usable response."""


class GeminiService:
    """Call Gemini with a system prompt and non-streaming conversation history."""

    def __init__(self, timeout_seconds: float = 30.0) -> None:
        self.timeout_seconds = timeout_seconds

    async def chat(
        self,
        system_prompt: str,
        messages: Sequence[ChatMessageItem],
        new_message: str,
    ) -> str:
        if not settings.GEMINI_ENABLED:
            raise GeminiServiceError("Gemini chưa được bật.")
        if not settings.GEMINI_API_KEY:
            raise GeminiServiceError("Thiếu GEMINI_API_KEY.")

        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise GeminiServiceError("Chưa cài đặt package google-genai.") from exc

        contents = [
            types.Content(
                role="model" if item.role == "assistant" else "user",
                parts=[types.Part.from_text(text=item.content)],
            )
            for item in messages[-50:]
        ]
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=new_message.strip())],
            )
        )

        async def _generate() -> str:
            async with genai.Client(api_key=settings.GEMINI_API_KEY).aio as client:
                response = await client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                    ),
                )
                return (response.text or "").strip()

        try:
            reply = await asyncio.wait_for(_generate(), timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise GeminiServiceError("Gemini phản hồi quá thời gian chờ.") from exc
        except Exception as exc:
            raise GeminiServiceError("Gemini API đang lỗi hoặc vượt quota.") from exc

        if not reply:
            raise GeminiServiceError("Gemini không trả về nội dung.")
        return reply
