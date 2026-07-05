"""Student AI chat API."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.models.user_account import UserAccount
from app.schemas.chat import ChatSendRequest, ChatSendResponse
from app.schemas.common import ApiResponse
from app.services.chat import handle_message
from app.services.gemini import GeminiServiceError

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/send", response_model=ApiResponse, summary="Gửi tin nhắn tới Lumin AI")
async def send_message(
    body: ChatSendRequest,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    try:
        reply = await handle_message(
            student_id=current_user.id,
            messages=body.messages[-50:],
            new_message=body.message,
            db=db,
        )
    except GeminiServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return ApiResponse(
        data=ChatSendResponse(
            reply=reply,
            created_at=datetime.now(timezone.utc),
        )
    )
