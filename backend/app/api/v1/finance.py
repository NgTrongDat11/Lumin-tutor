"""Staff/admin read-only finance reporting API."""

from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.services.finance import build_finance_excel, get_finance_rows, summarize_finance

router = APIRouter(prefix="/finance", tags=["Finance Reports"])


def _filters(
    date_from: date | None,
    date_to: date | None,
    month: int | None,
    year: int | None,
    tutor_id: int | None,
    target_type: str | None,
    class_id: int | None,
    contract_id: int | None,
    payment_status: str | None,
) -> dict:
    return {
        "date_from": date_from,
        "date_to": date_to,
        "month": month,
        "year": year,
        "tutor_id": tutor_id,
        "target_type": target_type,
        "class_id": class_id,
        "contract_id": contract_id,
        "payment_status": payment_status,
    }


@router.get("/summary", response_model=ApiResponse, summary="Tổng hợp doanh thu")
async def finance_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    tutor_id: int | None = None,
    target_type: str | None = None,
    class_id: int | None = None,
    contract_id: int | None = None,
    payment_status: str | None = None,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    del current_user
    rows = await get_finance_rows(
        db,
        **_filters(
            date_from, date_to, month, year, tutor_id, target_type,
            class_id, contract_id, payment_status,
        ),
    )
    return ApiResponse(data=summarize_finance(rows))


@router.get("/report", response_model=ApiResponse, summary="Chi tiết doanh thu")
async def finance_report(
    date_from: date | None = None,
    date_to: date | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    tutor_id: int | None = None,
    target_type: str | None = None,
    class_id: int | None = None,
    contract_id: int | None = None,
    payment_status: str | None = None,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    del current_user
    rows = await get_finance_rows(
        db,
        **_filters(
            date_from, date_to, month, year, tutor_id, target_type,
            class_id, contract_id, payment_status,
        ),
    )
    return ApiResponse(data=rows)


@router.get("/export.xlsx", summary="Xuất Excel doanh thu")
async def export_finance_excel(
    date_from: date | None = None,
    date_to: date | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    tutor_id: int | None = None,
    target_type: str | None = None,
    class_id: int | None = None,
    contract_id: int | None = None,
    payment_status: str | None = None,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    del current_user
    rows = await get_finance_rows(
        db,
        **_filters(
            date_from, date_to, month, year, tutor_id, target_type,
            class_id, contract_id, payment_status,
        ),
    )
    content = await run_in_threadpool(build_finance_excel, rows)
    suffix = f"{year:04d}-{month:02d}" if year and month else "toan-bo"
    filename = f"lumin-finance-{suffix}.xlsx"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
