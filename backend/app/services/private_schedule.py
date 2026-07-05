"""Private 1-1 schedule proposal and session helpers."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, time, timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course_class import CourseClass
from app.models.learning_session import LearningSession
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.schedule_block import ScheduleBlock
from app.models.schedule_pattern import SchedulePattern


PAID_PRIVATE_REQUEST_STATUSES = ("PAID", "ONGOING", "COMPLETED")


class ScheduleConflictError(ValueError):
    """Raised when a tutor already has an active block for the requested slot."""


def _slot_overlaps(
    start_a: time,
    end_a: time,
    start_b: time,
    end_b: time,
) -> bool:
    return start_a < end_b and end_a > start_b


def _format_conflict_message(conflict: ScheduleBlock) -> str:
    return (
        "Gia sư đã có lịch học chính thức trùng khung "
        f"thứ {conflict.day_of_week}, "
        f"{conflict.start_time.strftime('%H:%M')}-{conflict.end_time.strftime('%H:%M')}."
    )


async def find_private_schedule_conflicts(
    *,
    tutor_id: int,
    schedules: Iterable,
    db: AsyncSession,
    exclude_private_request_id: int | None = None,
    exclude_class_id: int | None = None,
) -> list[ScheduleBlock | SchedulePattern]:
    """Return active tutor blocks or confirmed request patterns that overlap the proposed private schedule."""
    proposed = [
        schedule
        for schedule in schedules
        if schedule.day_of_week and schedule.start_time and schedule.end_time
    ]
    if not proposed:
        return []

    days = sorted({schedule.day_of_week for schedule in proposed})
    query = select(ScheduleBlock).where(
        ScheduleBlock.tutor_id == tutor_id,
        ScheduleBlock.status == "ACTIVE",
        ScheduleBlock.day_of_week.in_(days),
    )
    if exclude_private_request_id is not None:
        query = query.where(
            or_(
                ScheduleBlock.private_request_id.is_(None),
                ScheduleBlock.private_request_id != exclude_private_request_id,
            )
        )
    if exclude_class_id is not None:
        query = query.where(
            or_(
                ScheduleBlock.class_id.is_(None),
                ScheduleBlock.class_id != exclude_class_id,
            )
        )

    result = await db.execute(query)
    active_blocks = result.scalars().all()

    # Find conflicting schedule patterns from other TUTOR_CONFIRMED requests
    pattern_query = (
        select(SchedulePattern)
        .join(
            PrivateTutoringRequest,
            SchedulePattern.private_request_id == PrivateTutoringRequest.id,
        )
        .where(
            PrivateTutoringRequest.tutor_id == tutor_id,
            PrivateTutoringRequest.status == "TUTOR_CONFIRMED",
            SchedulePattern.day_of_week.in_(days),
        )
    )
    if exclude_private_request_id is not None:
        pattern_query = pattern_query.where(
            SchedulePattern.private_request_id != exclude_private_request_id
        )

    pattern_result = await db.execute(pattern_query)
    confirmed_patterns = pattern_result.scalars().all()

    conflicts: list[ScheduleBlock | SchedulePattern] = []
    for schedule in proposed:
        for block in active_blocks:
            if schedule.day_of_week != block.day_of_week:
                continue
            if _slot_overlaps(schedule.start_time, schedule.end_time, block.start_time, block.end_time):
                conflicts.append(block)

        for pattern in confirmed_patterns:
            if schedule.day_of_week != pattern.day_of_week:
                continue
            if _slot_overlaps(schedule.start_time, schedule.end_time, pattern.start_time, pattern.end_time):
                conflicts.append(pattern)

    return conflicts


async def ensure_private_schedule_available(
    *,
    tutor_id: int,
    schedules: Iterable,
    db: AsyncSession,
    exclude_private_request_id: int | None = None,
    exclude_class_id: int | None = None,
) -> None:
    conflicts = await find_private_schedule_conflicts(
        tutor_id=tutor_id,
        schedules=schedules,
        db=db,
        exclude_private_request_id=exclude_private_request_id,
        exclude_class_id=exclude_class_id,
    )
    if conflicts:
        raise ScheduleConflictError(_format_conflict_message(conflicts[0]))


async def sync_private_request_sessions(
    req: PrivateTutoringRequest,
    db: AsyncSession,
) -> int:
    """Create official sessions for a paid private request from accepted patterns."""
    if req.status not in PAID_PRIVATE_REQUEST_STATUSES:
        return 0

    class_result = await db.execute(
        select(CourseClass).where(CourseClass.private_request_id == req.id)
    )
    course_class = class_result.scalar_one_or_none()

    pattern_filters = [SchedulePattern.private_request_id == req.id]
    if course_class:
        pattern_filters.append(SchedulePattern.class_id == course_class.id)
    patterns_result = await db.execute(
        select(SchedulePattern)
        .where(or_(*pattern_filters))
        .order_by(SchedulePattern.start_date, SchedulePattern.start_time, SchedulePattern.id)
    )
    patterns = patterns_result.scalars().all()
    if not patterns:
        return 0

    await ensure_private_schedule_available(
        tutor_id=req.tutor_id,
        schedules=patterns,
        db=db,
        exclude_private_request_id=req.id,
        exclude_class_id=course_class.id if course_class else None,
    )

    session_filters = [LearningSession.private_request_id == req.id]
    if course_class:
        session_filters.append(LearningSession.class_id == course_class.id)
    await db.execute(
        delete(LearningSession).where(
            or_(*session_filters),
            LearningSession.status == "SCHEDULED",
        )
    )

    block_filters = [ScheduleBlock.private_request_id == req.id]
    if course_class:
        block_filters.append(ScheduleBlock.class_id == course_class.id)
    await db.execute(delete(ScheduleBlock).where(or_(*block_filters)))

    start_date = course_class.start_date if course_class and course_class.start_date else min(
        p.start_date for p in patterns
    )
    end_date = course_class.end_date if course_class else None
    sessions = generate_private_sessions(
        req=req,
        class_id=course_class.id if course_class else None,
        patterns=patterns,
        start_date=start_date,
        total_sessions=req.requested_sessions,
        end_date=end_date,
    )

    for session in sessions:
        db.add(session)

    for pattern in patterns:
        db.add(
            ScheduleBlock(
                tutor_id=req.tutor_id,
                private_request_id=req.id,
                class_id=course_class.id if course_class else pattern.class_id,
                day_of_week=pattern.day_of_week,
                start_time=pattern.start_time,
                end_time=pattern.end_time,
            )
        )

    await db.flush()
    return len(sessions)


def generate_private_sessions(
    *,
    req: PrivateTutoringRequest,
    class_id: int | None,
    patterns: list[SchedulePattern],
    start_date: date,
    total_sessions: int,
    end_date: date | None = None,
) -> list[LearningSession]:
    sessions: list[LearningSession] = []
    if not patterns or total_sessions <= 0 or not start_date:
        return sessions

    is_custom_mode = all(p.total_sessions == 1 for p in patterns)
    if is_custom_mode:
        sorted_patterns = sorted(patterns, key=lambda x: (x.start_date, x.start_time))
        for idx, pattern in enumerate(sorted_patterns[:total_sessions]):
            sessions.append(
                LearningSession(
                    private_request_id=req.id,
                    class_id=class_id,
                    tutor_id=req.tutor_id,
                    session_number=idx + 1,
                    session_date=pattern.start_date,
                    start_time=pattern.start_time,
                    end_time=pattern.end_time,
                )
            )
        return sessions

    patterns_by_day: dict[int, list[SchedulePattern]] = defaultdict(list)
    for pattern in patterns:
        patterns_by_day[pattern.day_of_week].append(pattern)

    for day_patterns in patterns_by_day.values():
        day_patterns.sort(key=lambda x: x.start_time)

    current_date = start_date
    session_num = 0
    days_checked = 0
    max_days = 365 * 2

    while session_num < total_sessions and days_checked < max_days:
        if end_date and current_date > end_date:
            break

        current_weekday = current_date.weekday() + 1
        if current_weekday in patterns_by_day:
            for pattern in patterns_by_day[current_weekday]:
                if session_num >= total_sessions:
                    break
                session_num += 1
                sessions.append(
                    LearningSession(
                        private_request_id=req.id,
                        class_id=class_id,
                        tutor_id=req.tutor_id,
                        session_number=session_num,
                        session_date=current_date,
                        start_time=pattern.start_time,
                        end_time=pattern.end_time,
                    )
                )

        current_date += timedelta(days=1)
        days_checked += 1

    return sessions
