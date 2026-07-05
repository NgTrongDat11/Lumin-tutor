"""Shared payment confirmation workflow."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.teaching_contract import TeachingContract
from app.services.private_schedule import sync_private_request_sessions


async def confirm_payment_success(
    payment: Payment,
    db: AsyncSession,
    sepay_transaction_id: str | None = None,
) -> Payment:
    """Mark a payment as successful and update the linked business target."""
    if payment.status not in ("CREATED", "PENDING"):
        return payment

    reg: ClassRegistration | None = None

    if payment.target_type == "PRIVATE_TUTORING_REQUEST":
        result = await db.execute(
            select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == payment.target_id)
        )
        req = result.scalar_one_or_none()
        if not req:
            raise ValueError("Không tìm thấy yêu cầu 1-1.")
        if req.status not in ("PAYMENT_PENDING", "TUTOR_CONFIRMED"):
            raise ValueError("Yêu cầu không ở trạng thái chờ thanh toán.")
        req.status = "PAID"
        class_result = await db.execute(
            select(CourseClass).where(CourseClass.private_request_id == req.id)
        )
        course_class = class_result.scalar_one_or_none()
        if course_class:
            private_reg_result = await db.execute(
                select(ClassRegistration).where(
                    ClassRegistration.class_id == course_class.id,
                    ClassRegistration.student_account_id == req.student_account_id,
                )
            )
            private_reg = private_reg_result.scalar_one_or_none()
            if private_reg and private_reg.status in ("APPROVED", "PAYMENT_PENDING"):
                private_reg.status = "PAID"
        await sync_private_request_sessions(req, db)
    elif payment.target_type == "CLASS_REGISTRATION":
        result = await db.execute(
            select(ClassRegistration).where(ClassRegistration.id == payment.target_id)
        )
        reg = result.scalar_one_or_none()
        if not reg:
            raise ValueError("Không tìm thấy đăng ký lớp.")
        if reg.status not in ("PAYMENT_PENDING", "APPROVED"):
            raise ValueError("Đăng ký không ở trạng thái chờ thanh toán.")
        reg.status = "PAID"
    else:
        raise ValueError("target_type không hợp lệ.")

    payment.status = "SUCCEEDED"
    payment.paid_at = datetime.utcnow()
    if sepay_transaction_id:
        payment.sepay_transaction_id = sepay_transaction_id

    if payment.contract_id:
        contract_result = await db.execute(
            select(TeachingContract).where(TeachingContract.id == payment.contract_id)
        )
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise ValueError("Hợp đồng không tồn tại.")
        if (
            payment.target_type == "PRIVATE_TUTORING_REQUEST"
            and contract.private_request_id != payment.target_id
        ):
            raise ValueError("Hợp đồng không khớp yêu cầu 1-1.")
        if payment.target_type == "CLASS_REGISTRATION" and reg and contract.class_id != reg.class_id:
            raise ValueError("Hợp đồng không khớp lớp.")

        payment.center_amount_snapshot = (
            payment.amount * contract.center_rate_snapshot / Decimal("100")
        )
        payment.tutor_amount_snapshot = (
            payment.amount * contract.tutor_rate_snapshot / Decimal("100")
        )

    return payment
