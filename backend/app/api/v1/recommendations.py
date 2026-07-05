"""Recommendation API — get recommendations based on a learning need."""

import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db, require_role
from app.models.learning_need import LearningNeed
from app.models.recommendation_event import RecommendationEvent
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.schemas.course_class import CourseClassResponse
from app.schemas.recommendation import RecommendationEventCreate
from app.schemas.tutor import TutorPublicResponse
from app.services.chat import compute_and_save_recommendation_snapshot
from app.services.recommendation import recommend_for_discovery, recommend_for_need

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recommendations", tags=["Recommendation"])

EVENT_TYPES = {
    "VIEW",
    "CLICK",
    "FAVORITE",
    "REQUEST_PRIVATE",
    "REGISTER_CLASS",
    "PAYMENT_SUCCESS",
    "REVIEW",
}
TARGET_TYPE_ALIASES = {
    "CLASS": "COURSE_CLASS",
    "COURSE": "COURSE_CLASS",
    "COURSECLASS": "COURSE_CLASS",
    "COURSE_CLASS": "COURSE_CLASS",
    "TUTOR": "TUTOR",
}


@router.get(
    "/discovery",
    response_model=ApiResponse,
    summary="Gợi ý khởi đầu khi học viên chưa tạo cấu hình",
)
async def get_discovery_recommendations(
    query: str | None = Query(default=None, max_length=200),
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    results = await recommend_for_discovery(current_user, db, query=query)
    serialized = _serialize_recommendation_results(results)
    from app.schemas.recommendation import RecommendationResponse
    validated = RecommendationResponse.model_validate(serialized)
    return ApiResponse(data=validated.model_dump())



@router.get(
    "/for-need/{need_id}",
    response_model=ApiResponse,
    summary="Gợi ý gia sư + lớp nhóm theo nhu cầu học",
)
async def get_recommendations(
    need_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules))
        .where(
            LearningNeed.id == need_id,
            LearningNeed.student_account_id == current_user.id,
        )
    )
    need = result.scalar_one_or_none()
    if not need or need.status == "ARCHIVED":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhu cầu học.")

    if need.status != "ACTIVE":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Nhu cầu học không ở trạng thái hoạt động."
        )

    results = await recommend_for_need(need, db)

    try:
        await compute_and_save_recommendation_snapshot(need, db)
    except Exception:
        logger.warning("Failed to update recommendation snapshot for need %s", need_id, exc_info=True)

    serialized = _serialize_recommendation_results(results)
    from app.schemas.recommendation import RecommendationResponse
    validated = RecommendationResponse.model_validate(serialized)
    return ApiResponse(data=validated.model_dump())


def _serialize_recommendation_results(results: dict) -> dict:
    recommended_tutors = []
    for item in results["tutors"]:
        tutor = item["tutor"]
        from app.schemas.tutor import TutorAvailabilityResponse, TutorSubjectResponse

        tutor_data = TutorPublicResponse(
            id=tutor.id,
            full_name=tutor.account.full_name if tutor.account else "N/A",
            avatar_url=tutor.account.avatar_url if tutor.account else None,
            bio=tutor.bio,
            qualification_level=tutor.qualification_level,
            years_experience=tutor.years_experience,
            teaching_mode=tutor.teaching_mode,
            teaching_area=tutor.teaching_area,
            verification_status=tutor.verification_status,
            average_rating=tutor.average_rating,
            rating_count=tutor.rating_count,
            subjects=[
                TutorSubjectResponse(
                    id=ts.id,
                    subject_id=ts.subject_id,
                    subject_name=ts.subject.name if ts.subject else None,
                    grade_level=ts.grade_level,
                    fee_per_session=ts.fee_per_session,
                    status=ts.status,
                )
                for ts in tutor.subjects
                if ts.status == "APPROVED"
            ],
            availabilities=[
                TutorAvailabilityResponse.model_validate(a)
                for a in tutor.availabilities
            ],
        )
        recommended_tutors.append({
            "tutor": tutor_data.model_dump(),
            "score": float(item["score"]),
            "reasons": item["reasons"],
            "pillars": item.get("pillars", []),
            "practical_breakdown": item.get("practical_breakdown", []),
            "score_breakdown": item.get("score_breakdown", []),
            "score_adjustments": item.get("score_adjustments", []),
            "semantic": item.get("semantic"),
            "reputation_breakdown": item.get("reputation_breakdown", []),
        })

    recommended_classes = []
    for item in results["classes"]:
        cc = item["course_class"]
        recommended_classes.append({
            "course_class": CourseClassResponse.model_validate(cc).model_dump(),
            "score": float(item["score"]),
            "reasons": item["reasons"],
            "pillars": item.get("pillars", []),
            "practical_breakdown": item.get("practical_breakdown", []),
            "score_breakdown": item.get("score_breakdown", []),
            "score_adjustments": item.get("score_adjustments", []),
            "semantic": item.get("semantic"),
            "reputation_breakdown": item.get("reputation_breakdown", []),
        })

    return {
        "recommended_tutors": recommended_tutors,
        "recommended_classes": recommended_classes,
        "context": results.get("context"),
    }



@router.post(
    "/events",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ghi log sự kiện tương tác với gợi ý",
)
async def log_event(
    body: RecommendationEventCreate,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    event_type = body.event_type.strip().upper()
    if event_type not in EVENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "event_type không hợp lệ.")

    target_type, target_id = _resolve_event_target(body)

    if body.learning_need_id is not None:
        result = await db.execute(
            select(LearningNeed.id).where(
                LearningNeed.id == body.learning_need_id,
                LearningNeed.student_account_id == current_user.id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhu cầu học.")

    event = RecommendationEvent(
        student_account_id=current_user.id,
        learning_need_id=body.learning_need_id,
        target_type=target_type,
        target_id=target_id,
        event_type=event_type,
        score_snapshot=_normalize_score(body.score_snapshot),
        reason_snapshot=_normalize_reason_snapshot(body.reason_snapshot),
    )
    db.add(event)
    await db.commit()
    return ApiResponse(message="Ghi log thành công.")


def _resolve_event_target(body: RecommendationEventCreate) -> tuple[str, int]:
    if body.target_type and body.target_id:
        target_type = _normalize_target_type(body.target_type)
        return target_type, body.target_id
    if body.tutor_id:
        return "TUTOR", body.tutor_id
    if body.class_id:
        return "COURSE_CLASS", body.class_id
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Thiếu target_type/target_id cho sự kiện gợi ý.")


def _normalize_target_type(value: str) -> str:
    normalized = value.strip().upper()
    target_type = TARGET_TYPE_ALIASES.get(normalized)
    if not target_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "target_type không hợp lệ.")
    return target_type


def _normalize_score(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(round(float(value), 4)))


def _normalize_reason_snapshot(value: str | list[str] | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return "\n".join(str(item) for item in value if item)
    return value
