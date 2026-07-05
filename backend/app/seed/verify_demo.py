"""Verify the canonical Lumin demo dataset after seeding."""

from __future__ import annotations

import asyncio
from decimal import Decimal

from sqlalchemy import func, select

from app.db.session import async_session_factory
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.learning_session import LearningSession
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.subject import Subject
from app.models.system_setting import SystemSetting
from app.models.teaching_contract import TeachingContract
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.seed.demo_v2 import CAN_THO_NINH_KIEU, DEMO_SEED_VERSION, VINH_LONG_TRA_VINH
from app.services.finance import get_finance_rows, summarize_finance


EXPECTED_COUNTS = {
    UserAccount: 12,
    TutorProfile: 7,
    Subject: 6,
    LearningNeed: 3,
    PrivateTutoringRequest: 4,
    CourseClass: 7,
    ClassRegistration: 6,
    TeachingContract: 6,
    Payment: 6,
    LearningSession: 34,
}


async def verify_demo_seed() -> None:
    async with async_session_factory() as db:
        for model, expected in EXPECTED_COUNTS.items():
            actual = (await db.execute(select(func.count()).select_from(model))).scalar_one()
            if actual != expected:
                raise AssertionError(f"{model.__tablename__}: expected {expected}, got {actual}")

        seed_version = await db.scalar(
            select(SystemSetting.value).where(SystemSetting.key == "demo_seed_version")
        )
        if seed_version != DEMO_SEED_VERSION:
            raise AssertionError(f"Expected seed version {DEMO_SEED_VERSION}, got {seed_version}")

        student_address = await db.scalar(
            select(UserAccount.address).where(UserAccount.email == "student@lumin.local")
        )
        student2_address = await db.scalar(
            select(UserAccount.address).where(UserAccount.email == "student2@lumin.local")
        )
        if student_address != VINH_LONG_TRA_VINH or student2_address != CAN_THO_NINH_KIEU:
            raise AssertionError("Demo students must use Mekong-region addresses")

        user_addresses = (await db.execute(select(UserAccount.address))).scalars().all()
        tutor_areas = (await db.execute(select(TutorProfile.teaching_area))).scalars().all()
        stale_locations = [
            value
            for value in [*user_addresses, *tutor_areas]
            if value and ("TP.HCM" in value or "Quận" in value)
        ]
        if stale_locations:
            raise AssertionError(f"Seed still contains old location data: {stale_locations}")

        fallback_need = await db.scalar(
            select(LearningNeed).where(
                LearningNeed.raw_text == f"{DEMO_SEED_VERSION}:student2@lumin.local:Toán"
            )
        )
        if not fallback_need or fallback_need.preferred_area is not None:
            raise AssertionError("Math learning need should rely on the student address fallback")
        recognized = (await db.execute(select(Payment).where(Payment.status.in_(("SUCCEEDED", "REFUNDED"))))).scalars().all()
        if len(recognized) != 4:
            raise AssertionError(f"Expected 4 recognized payments, got {len(recognized)}")
        for payment in recognized:
            if not payment.contract_id or not payment.paid_at:
                raise AssertionError(f"Payment #{payment.id} lacks contract or paid_at")
            if payment.center_amount_snapshot is None or payment.tutor_amount_snapshot is None:
                raise AssertionError(f"Payment #{payment.id} lacks allocation snapshots")
            if payment.center_amount_snapshot + payment.tutor_amount_snapshot != payment.amount:
                raise AssertionError(f"Payment #{payment.id} has invalid allocation total")

        summary = summarize_finance(await get_finance_rows(db))
        expected_summary = {
            "gross_amount": Decimal("9000000.00"), "refund_amount": Decimal("400000.00"),
            "net_amount": Decimal("8600000.00"), "center_net": Decimal("3500000.00"),
            "tutor_net": Decimal("5100000.00"),
        }
        for field, expected in expected_summary.items():
            if getattr(summary, field) != expected:
                raise AssertionError(f"Finance {field}: expected {expected}, got {getattr(summary, field)}")
        if summary.missing_snapshot_count:
            raise AssertionError("Recognized payments must all have valid allocation data")

    print("Demo seed verification passed.")


if __name__ == "__main__":
    asyncio.run(verify_demo_seed())
