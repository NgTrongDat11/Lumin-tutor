"""Notification API — list, unread count, mark read."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.notification import Notification
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.schemas.notification import NotificationResponse, NotificationUnreadCount

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=ApiResponse, summary="Lấy danh sách thông báo")
async def list_notifications(
    limit: int = Query(default=5, ge=1, le=50),
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lấy danh sách thông báo của user hiện tại, mới nhất trước."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return ApiResponse(data=[NotificationResponse.model_validate(r) for r in rows])


@router.get("/unread-count", response_model=ApiResponse, summary="Đếm thông báo chưa đọc")
async def unread_count(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)  # noqa: E712
    )
    count = result.scalar() or 0
    return ApiResponse(data=NotificationUnreadCount(count=count))


@router.put("/{notification_id}/read", response_model=ApiResponse, summary="Đánh dấu đã đọc")
async def mark_read(
    notification_id: int,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    noti = result.scalar_one_or_none()
    if not noti:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thông báo không tồn tại.")
    if not noti.is_read:
        noti.is_read = True
        noti.read_at = datetime.now(timezone.utc)
        await db.commit()
    return ApiResponse(message="Đã đánh dấu đã đọc.")


@router.put("/read-all", response_model=ApiResponse, summary="Đánh dấu tất cả đã đọc")
async def mark_all_read(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)  # noqa: E712
        .values(is_read=True, read_at=now)
    )
    await db.commit()
    return ApiResponse(message="Đã đánh dấu tất cả đã đọc.")


# ── Helper: tạo notification (dùng internal, không phải endpoint) ──


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    body: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> Notification:
    """Tạo 1 notification mới. Gọi từ các module khác (schedules, chat, ...)."""
    noti = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    db.add(noti)
    await db.flush()
    return noti


async def create_notifications_bulk(
    db: AsyncSession,
    *,
    user_ids: list[int],
    notification_type: str,
    title: str,
    body: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> list[Notification]:
    """Tạo notification cho nhiều user cùng lúc (ví dụ: student + tutor)."""
    notifications = []
    for uid in user_ids:
        noti = Notification(
            user_id=uid,
            notification_type=notification_type,
            title=title,
            body=body,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        db.add(noti)
        notifications.append(noti)
    await db.flush()
    return notifications
