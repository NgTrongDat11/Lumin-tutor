"""Tutor read-only income allocation API."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.services.finance import (
    get_finance_rows,
    summarize_tutor_income,
    to_tutor_transactions,
)

router = APIRouter(prefix="/tutor/income", tags=["Tutor Income"])


def _current_tutor_id(current_user: UserAccount) -> int:
    if not current_user.tutor_profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có hồ sơ gia sư.")
    return current_user.tutor_profile.id


@router.get("/summary", response_model=ApiResponse, summary="Tổng hợp phần thu nhập gia sư")
async def tutor_income_summary(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    rows = await get_finance_rows(db, tutor_id=_current_tutor_id(current_user))
    return ApiResponse(data=summarize_tutor_income(rows))


@router.get("/transactions", response_model=ApiResponse, summary="Chi tiết phần thu nhập gia sư")
async def tutor_income_transactions(
    date_from: date | None = None,
    date_to: date | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    target_type: str | None = None,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    rows = await get_finance_rows(
        db,
        date_from=date_from,
        date_to=date_to,
        month=month,
        year=year,
        tutor_id=_current_tutor_id(current_user),
        target_type=target_type,
    )
    return ApiResponse(data=to_tutor_transactions(rows))
