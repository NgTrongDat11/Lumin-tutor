"""Helpers for finishing course classes and their linked records."""

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course_class import CourseClass
from app.models.learning_session import LearningSession
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.teaching_contract import TeachingContract


CLASS_STATUSES = {
    "DRAFT",
    "TUTOR_RECRUITING",
    "ENROLLING",
    "READY",
    "ONGOING",
    "COMPLETED",
    "CANCELLED",
}

COMPLETABLE_CLASS_STATUSES = {"READY", "ONGOING"}
COMPLETABLE_PRIVATE_REQUEST_STATUSES = {"PAID", "ONGOING"}


async def complete_course_class(course_class: CourseClass, db: AsyncSession) -> bool:
    """Mark a class and its directly linked operational records as completed."""
    if course_class.status == "COMPLETED":
        return False

    course_class.status = "COMPLETED"

    contract_filters = [TeachingContract.class_id == course_class.id]
    if course_class.private_request_id:
        contract_filters.append(TeachingContract.private_request_id == course_class.private_request_id)

    contract_result = await db.execute(select(TeachingContract).where(or_(*contract_filters)))
    for contract in contract_result.scalars().all():
        if contract.status != "CANCELLED":
            contract.status = "COMPLETED"

    if course_class.private_request_id:
        req_result = await db.execute(
            select(PrivateTutoringRequest).where(
                PrivateTutoringRequest.id == course_class.private_request_id
            )
        )
        req = req_result.scalar_one_or_none()
        if req and req.status in COMPLETABLE_PRIVATE_REQUEST_STATUSES:
            req.status = "COMPLETED"

    return True


async def complete_course_class_if_all_sessions_completed(
    class_id: int,
    db: AsyncSession,
) -> bool:
    """Auto-finish a class once every generated session is completed."""
    class_result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    course_class = class_result.scalar_one_or_none()
    if not course_class or course_class.status not in COMPLETABLE_CLASS_STATUSES:
        return False

    session_filters = [LearningSession.class_id == class_id]
    if course_class.private_request_id:
        session_filters.append(LearningSession.private_request_id == course_class.private_request_id)

    total_sessions = await db.scalar(
        select(func.count())
        .select_from(LearningSession)
        .where(or_(*session_filters))
    )
    if not total_sessions:
        return False

    unfinished_sessions = await db.scalar(
        select(func.count())
        .select_from(LearningSession)
        .where(
            or_(*session_filters),
            LearningSession.status != "COMPLETED",
        )
    )
    if unfinished_sessions:
        return False

    return await complete_course_class(course_class, db)


async def complete_private_request_if_all_sessions_completed(
    private_request_id: int,
    db: AsyncSession,
) -> bool:
    """Auto-finish a private 1-1 request once every generated session is completed."""
    req_result = await db.execute(
        select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == private_request_id)
    )
    req = req_result.scalar_one_or_none()
    if not req or req.status not in COMPLETABLE_PRIVATE_REQUEST_STATUSES:
        return False

    total_sessions = await db.scalar(
        select(func.count())
        .select_from(LearningSession)
        .where(LearningSession.private_request_id == private_request_id)
    )
    if not total_sessions:
        return False

    unfinished_sessions = await db.scalar(
        select(func.count())
        .select_from(LearningSession)
        .where(
            LearningSession.private_request_id == private_request_id,
            LearningSession.status != "COMPLETED",
        )
    )
    if unfinished_sessions:
        return False

    changed = False

    class_result = await db.execute(
        select(CourseClass).where(CourseClass.private_request_id == private_request_id)
    )
    for course_class in class_result.scalars().all():
        if course_class.status in COMPLETABLE_CLASS_STATUSES:
            changed = await complete_course_class(course_class, db) or changed

    if req.status in COMPLETABLE_PRIVATE_REQUEST_STATUSES:
        req.status = "COMPLETED"
        changed = True

    contract_result = await db.execute(
        select(TeachingContract).where(TeachingContract.private_request_id == private_request_id)
    )
    for contract in contract_result.scalars().all():
        if contract.status != "CANCELLED":
            contract.status = "COMPLETED"
            changed = True

    return changed
