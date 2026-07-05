"""Learning needs API — create, list, get, update, delete."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db, require_role
from app.models.learning_need import LearningNeed
from app.models.learning_need_schedule import LearningNeedSchedule
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.schemas.learning_need import LearningNeedCreate, LearningNeedResponse, LearningNeedUpdate
from app.services.chat import compute_and_save_recommendation_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/learning-needs", tags=["Learning Needs"])


@router.post(
    "",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo nhu cầu học",
)
async def create_learning_need(
    body: LearningNeedCreate,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    need = LearningNeed(
        student_account_id=current_user.id,
        subject_id=body.subject_id,
        grade_level=body.grade_level,
        goal=body.goal,
        budget_per_session_min=body.budget_per_session_min,
        budget_per_session_max=body.budget_per_session_max,
        preferred_mode=body.preferred_mode,
        preferred_learning_type=body.preferred_learning_type,
        preferred_area=body.preferred_area,
        raw_text=body.raw_text,
        parser_source="FORM",
    )
    db.add(need)
    await db.flush()

    # Add schedules
    for sched in body.schedules:
        db.add(LearningNeedSchedule(
            learning_need_id=need.id,
            day_of_week=sched.day_of_week,
            start_time=sched.start_time,
            end_time=sched.end_time,
            time_slot=sched.time_slot,
        ))

    await db.commit()

    # Reload with schedules for recommendation computation
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(LearningNeed.id == need.id)
    )
    need = result.scalar_one()

    # Compute and save recommendation snapshot
    try:
        await compute_and_save_recommendation_snapshot(need, db)
    except Exception:
        logger.warning("Failed to compute recommendation snapshot for need %s", need.id, exc_info=True)

    return ApiResponse(
        data=LearningNeedResponse.model_validate(need),
        message="Tạo nhu cầu học thành công.",
    )


@router.get("", response_model=ApiResponse, summary="Danh sách nhu cầu học của tôi")
async def list_my_learning_needs(
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(
            LearningNeed.student_account_id == current_user.id,
            LearningNeed.status == "ACTIVE"
        )
        .order_by(LearningNeed.created_at.desc())
    )
    needs = result.scalars().all()
    return ApiResponse(data=[LearningNeedResponse.model_validate(n) for n in needs])


@router.get("/{need_id}", response_model=ApiResponse, summary="Chi tiết nhu cầu học")
async def get_learning_need(
    need_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(
            LearningNeed.id == need_id,
            LearningNeed.student_account_id == current_user.id
        )
    )
    need = result.scalar_one_or_none()
    if not need or need.status == "ARCHIVED":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhu cầu học.")
    return ApiResponse(data=LearningNeedResponse.model_validate(need))


@router.put("/{need_id}", response_model=ApiResponse, summary="Cập nhật nhu cầu học")
async def update_learning_need(
    need_id: int,
    body: LearningNeedUpdate,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(
            LearningNeed.id == need_id,
            LearningNeed.student_account_id == current_user.id
        )
    )
    need = result.scalar_one_or_none()
    if not need or need.status == "ARCHIVED":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhu cầu học.")

    # Full replacement of fields, preserving parser metadata
    need.subject_id = body.subject_id
    need.grade_level = body.grade_level
    need.goal = body.goal
    need.budget_per_session_min = body.budget_per_session_min
    need.budget_per_session_max = body.budget_per_session_max
    need.preferred_mode = body.preferred_mode
    need.preferred_learning_type = body.preferred_learning_type
    need.preferred_area = body.preferred_area
    if body.raw_text is not None:
        need.raw_text = body.raw_text

    # Clear old snapshot
    need.recommendation_snapshot = None
    need.recommendation_updated_at = None

    # Replace schedules atomically
    need.schedules = [
        LearningNeedSchedule(
            day_of_week=sched.day_of_week,
            start_time=sched.start_time,
            end_time=sched.end_time,
            time_slot=sched.time_slot,
        )
        for sched in body.schedules
    ]

    await db.commit()

    # Reload with schedules for recommendation computation
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(LearningNeed.id == need_id)
    )
    need = result.scalar_one()

    # Compute and save recommendation snapshot (best-effort)
    try:
        await compute_and_save_recommendation_snapshot(need, db, commit=True)
    except Exception:
        logger.warning("Failed to compute recommendation snapshot for need %s after update", need.id, exc_info=True)

    return ApiResponse(
        data=LearningNeedResponse.model_validate(need),
        message="Cập nhật nhu cầu học thành công.",
    )


@router.delete("/{need_id}", response_model=ApiResponse, summary="Xoá nhu cầu học")
async def delete_learning_need(
    need_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(
            LearningNeed.id == need_id,
            LearningNeed.student_account_id == current_user.id
        )
    )
    need = result.scalar_one_or_none()
    if not need or need.status == "ARCHIVED":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhu cầu học.")

    # Soft delete (archive)
    need.status = "ARCHIVED"

    # Clear snapshot
    need.recommendation_snapshot = None
    need.recommendation_updated_at = None

    await db.commit()

    return ApiResponse(message="Xoá nhu cầu học thành công.")
