"""Backfill private 1-1 classes from confirmed private requests."""

from __future__ import annotations

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import async_session_factory
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.subject import Subject
from app.models.teaching_contract import TeachingContract


CONFIRMED_STATUSES = ("TUTOR_CONFIRMED", "PAID", "ONGOING", "COMPLETED")


async def main() -> None:
    created_classes = 0
    created_registrations = 0
    linked_contracts = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(PrivateTutoringRequest).where(
                PrivateTutoringRequest.status.in_(CONFIRMED_STATUSES),
                PrivateTutoringRequest.agreed_fee_per_session.is_not(None),
            )
        )
        requests = result.scalars().all()

        for req in requests:
            class_result = await db.execute(
                select(CourseClass).where(CourseClass.private_request_id == req.id)
            )
            course_class = class_result.scalar_one_or_none()

            if not course_class:
                subject_result = await db.execute(
                    select(Subject).where(Subject.id == req.subject_id)
                )
                subject = subject_result.scalar_one_or_none()
                subject_name = subject.name if subject else f"Môn #{req.subject_id}"
                course_class = CourseClass(
                    private_request_id=req.id,
                    subject_id=req.subject_id,
                    primary_tutor_id=req.tutor_id,
                    title=f"1-1 {subject_name} - {req.grade_level}",
                    grade_level=req.grade_level,
                    goal=req.goal,
                    fee_per_session_per_student=req.agreed_fee_per_session,
                    total_sessions=req.requested_sessions,
                    min_students=1,
                    max_students=1,
                    mode=req.mode,
                    status="READY",
                )
                db.add(course_class)
                await db.flush()
                created_classes += 1

            registration_result = await db.execute(
                select(ClassRegistration).where(
                    ClassRegistration.class_id == course_class.id,
                    ClassRegistration.student_account_id == req.student_account_id,
                )
            )
            if not registration_result.scalar_one_or_none():
                db.add(
                    ClassRegistration(
                        class_id=course_class.id,
                        student_account_id=req.student_account_id,
                        learning_need_id=req.learning_need_id,
                        status="PAID" if req.status in ("PAID", "ONGOING", "COMPLETED") else "APPROVED",
                        review_note="Tự động tạo từ yêu cầu 1-1 đã xác nhận.",
                    )
                )
                created_registrations += 1

            contract_result = await db.execute(
                select(TeachingContract).where(TeachingContract.private_request_id == req.id)
            )
            contract = contract_result.scalar_one_or_none()
            if contract:
                if contract.class_id != course_class.id:
                    contract.class_id = course_class.id
                    linked_contracts += 1
            else:
                db.add(
                    TeachingContract(
                        tutor_id=req.tutor_id,
                        private_request_id=req.id,
                        class_id=course_class.id,
                        commission_name_snapshot="Default Commission",
                        center_rate_snapshot=Decimal("30.00"),
                        tutor_rate_snapshot=Decimal("70.00"),
                    )
                )
                linked_contracts += 1

        await db.commit()

    print({
        "checked_requests": len(requests),
        "created_classes": created_classes,
        "created_registrations": created_registrations,
        "linked_contracts": linked_contracts,
    })


if __name__ == "__main__":
    asyncio.run(main())
