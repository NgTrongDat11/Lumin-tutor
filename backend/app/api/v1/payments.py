"""Payment mock API + Review API."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.payment import Payment
from app.models.review import Review
from app.models.teaching_contract import TeachingContract
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.schemas.payment import (
    PaymentResponse,
    PaymentRefund,
    PaymentStatusResponse,
    ReviewCreate,
    ReviewResponse,
)
from app.services.payment_confirm import confirm_payment_success
from app.services.private_schedule import ScheduleConflictError
from app.services.sepay import enrich_payment_with_sepay, get_payment_response_extras, is_sepay_enabled

router = APIRouter(tags=["Payments & Reviews"])

ALLOWED_TARGET_TYPES = ("PRIVATE_TUTORING_REQUEST", "CLASS_REGISTRATION")


def _validate_target_type(target_type: str) -> None:
    if target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "target_type không hợp lệ.")


def _payment_response(payment: Payment) -> PaymentResponse:
    resp = PaymentResponse.model_validate(payment)
    if not resp.provider:
        resp.provider = "MOCK"
    if resp.provider.upper() == "SEPAY":
        extras = get_payment_response_extras(payment)
        resp.qr_amount = extras["qr_amount"]
        resp.qr_data_url = extras.get("qr_data_url") or resp.qr_data_url
        resp.display_amount = extras["display_amount"]
        resp.bank_info = extras["bank_info"]
        resp.is_test_mode = extras["is_test_mode"]
        resp.amount_divisor = extras["amount_divisor"]
    return resp


# ── Payment ──────────────────────────────────────────────


@router.post(
    "/payments/{payment_id}/pay",
    response_model=ApiResponse,
    summary="Mock thanh toán thành công",
)
async def mock_pay(
    payment_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    if is_sepay_enabled():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Mock payment không khả dụng. Vui lòng chuyển khoản qua QR.",
        )

    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.student_account_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    if payment.status not in ("CREATED", "PENDING"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thanh toán không ở trạng thái chờ.")

    _validate_target_type(payment.target_type)

    try:
        await confirm_payment_success(payment, db)
    except ScheduleConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    await db.commit()
    await db.refresh(payment)
    return ApiResponse(
        data=_payment_response(payment),
        message="Thanh toán thành công. Trạng thái đã được cập nhật.",
    )


@router.get(
    "/payments/{payment_id}/status",
    response_model=ApiResponse,
    summary="Kiểm tra trạng thái thanh toán",
)
async def check_payment_status(
    payment_id: int,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")

    if current_user.role == "STUDENT":
        if payment.student_account_id != current_user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền.")
    elif current_user.role == "TUTOR":
        if not current_user.tutor_profile or not payment.contract_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền.")
        contract_result = await db.execute(
            select(TeachingContract).where(
                TeachingContract.id == payment.contract_id,
                TeachingContract.tutor_id == current_user.tutor_profile.id,
            )
        )
        if not contract_result.scalar_one_or_none():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền.")
    elif current_user.role not in ("STAFF", "SUPER_ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có quyền.")

    return ApiResponse(
        data=PaymentStatusResponse(
            payment_id=payment.id,
            status=payment.status,
            paid_at=payment.paid_at,
        )
    )


@router.post(
    "/payments/{payment_id}/regenerate-qr",
    response_model=ApiResponse,
    summary="Tạo lại mã QR thanh toán",
)
async def regenerate_payment_qr(
    payment_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.student_account_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    if payment.status not in ("CREATED", "PENDING"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ có thể tạo lại mã cho giao dịch đang chờ.")
    if (payment.provider or "").upper() != "SEPAY":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ giao dịch SePay mới có mã QR để tạo lại.")

    _validate_target_type(payment.target_type)

    if payment.target_type == "PRIVATE_TUTORING_REQUEST":
        from app.models.private_tutoring_request import PrivateTutoringRequest

        target_result = await db.execute(
            select(PrivateTutoringRequest).where(
                PrivateTutoringRequest.id == payment.target_id,
                PrivateTutoringRequest.student_account_id == current_user.id,
            )
        )
        req = target_result.scalar_one_or_none()
        if not req or req.status not in ("PAYMENT_PENDING", "TUTOR_CONFIRMED"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu không ở trạng thái chờ thanh toán.")
    else:
        from app.models.class_registration import ClassRegistration

        target_result = await db.execute(
            select(ClassRegistration).where(
                ClassRegistration.id == payment.target_id,
                ClassRegistration.student_account_id == current_user.id,
            )
        )
        reg = target_result.scalar_one_or_none()
        if not reg or reg.status not in ("PAYMENT_PENDING", "APPROVED"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đăng ký không ở trạng thái chờ thanh toán.")

    payment.status = "CANCELLED"
    replacement = Payment(
        student_account_id=payment.student_account_id,
        target_type=payment.target_type,
        target_id=payment.target_id,
        contract_id=payment.contract_id,
        amount=payment.amount,
        currency=payment.currency,
        billing_cycle_label=payment.billing_cycle_label,
        status="CREATED",
    )
    db.add(replacement)
    await enrich_payment_with_sepay(replacement, db)

    await db.commit()
    await db.refresh(replacement)
    return ApiResponse(
        data=_payment_response(replacement),
        message="Đã tạo mã QR mới.",
    )


@router.get("/payments", response_model=ApiResponse, summary="Lịch sử thanh toán")
async def list_payments(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Payment).order_by(Payment.created_at.desc())
    if current_user.role == "STUDENT":
        query = query.where(Payment.student_account_id == current_user.id)
    elif current_user.role == "TUTOR":
        if not current_user.tutor_profile:
            return ApiResponse(data=[])
        from app.models.teaching_contract import TeachingContract
        query = (
            query.join(TeachingContract, Payment.contract_id == TeachingContract.id)
            .where(TeachingContract.tutor_id == current_user.tutor_profile.id)
        )
    elif current_user.role not in ("STAFF", "SUPER_ADMIN"):
        return ApiResponse(data=[])
    result = await db.execute(query)
    payments = result.scalars().all()

    # Enrich payments
    enriched_payments = []
    if payments:
        from app.models.private_tutoring_request import PrivateTutoringRequest
        from app.models.class_registration import ClassRegistration
        from app.models.course_class import CourseClass
        from app.models.subject import Subject
        from app.models.tutor_profile import TutorProfile

        # Pre-fetch for Private Tutoring Requests
        req_ids = [p.target_id for p in payments if p.target_type == "PRIVATE_TUTORING_REQUEST"]
        reqs = {}
        if req_ids:
            req_query = select(PrivateTutoringRequest, UserAccount.full_name, Subject.name).join(
                TutorProfile, PrivateTutoringRequest.tutor_id == TutorProfile.id
            ).join(
                UserAccount, TutorProfile.account_id == UserAccount.id
            ).join(
                Subject, PrivateTutoringRequest.subject_id == Subject.id
            ).where(PrivateTutoringRequest.id.in_(req_ids))
            req_result = await db.execute(req_query)
            for req, tutor_name, subject_name in req_result:
                reqs[req.id] = {
                    "target_name": f"Yêu cầu 1-1 ({req.requested_sessions} buổi)",
                    "tutor_name": tutor_name,
                    "subject_name": subject_name
                }
        
        # Pre-fetch for Class Registrations
        reg_ids = [p.target_id for p in payments if p.target_type == "CLASS_REGISTRATION"]
        regs = {}
        if reg_ids:
            reg_query = select(ClassRegistration, CourseClass, UserAccount.full_name, Subject.name).join(
                CourseClass, ClassRegistration.class_id == CourseClass.id
            ).outerjoin(
                TutorProfile, CourseClass.primary_tutor_id == TutorProfile.id
            ).outerjoin(
                UserAccount, TutorProfile.account_id == UserAccount.id
            ).join(
                Subject, CourseClass.subject_id == Subject.id
            ).where(ClassRegistration.id.in_(reg_ids))
            reg_result = await db.execute(reg_query)
            for reg, course_class, tutor_name, subject_name in reg_result:
                regs[reg.id] = {
                    "target_name": course_class.title,
                    "tutor_name": tutor_name or "Chưa phân công",
                    "subject_name": subject_name
                }

        for p in payments:
            resp = _payment_response(p)
            if p.target_type == "PRIVATE_TUTORING_REQUEST" and p.target_id in reqs:
                resp.target_name = reqs[p.target_id]["target_name"]
                resp.tutor_name = reqs[p.target_id]["tutor_name"]
                resp.subject_name = reqs[p.target_id]["subject_name"]
            elif p.target_type == "CLASS_REGISTRATION" and p.target_id in regs:
                resp.target_name = regs[p.target_id]["target_name"]
                resp.tutor_name = regs[p.target_id]["tutor_name"]
                resp.subject_name = regs[p.target_id]["subject_name"]
            enriched_payments.append(resp)
    else:
        enriched_payments = []

    return ApiResponse(data=enriched_payments)


@router.post(
    "/payments/{payment_id}/cancel",
    response_model=ApiResponse,
    summary="Hủy thanh toán",
)
async def cancel_payment(
    payment_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.student_account_id == current_user.id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    if payment.status not in ("CREATED", "PENDING"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thanh toán không ở trạng thái có thể hủy.")

    payment.status = "CANCELLED"

    # Revert target status if applicable
    if payment.target_type == "PRIVATE_TUTORING_REQUEST":
        from app.models.private_tutoring_request import PrivateTutoringRequest
        req_res = await db.execute(
            select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == payment.target_id)
        )
        req = req_res.scalar_one_or_none()
        if req and req.status == "PAYMENT_PENDING":
            req.status = "TUTOR_CONFIRMED"
    elif payment.target_type == "CLASS_REGISTRATION":
        from app.models.class_registration import ClassRegistration
        reg_res = await db.execute(
            select(ClassRegistration).where(ClassRegistration.id == payment.target_id)
        )
        reg = reg_res.scalar_one_or_none()
        if reg and reg.status == "PAYMENT_PENDING":
            reg.status = "APPROVED"

    replacement = Payment(
        student_account_id=payment.student_account_id,
        target_type=payment.target_type,
        target_id=payment.target_id,
        contract_id=payment.contract_id,
        amount=payment.amount,
        currency=payment.currency,
        billing_cycle_label=payment.billing_cycle_label,
        status="CREATED",
    )
    db.add(replacement)
    await enrich_payment_with_sepay(replacement, db)

    await db.commit()
    await db.refresh(replacement)
    return ApiResponse(
        data=_payment_response(replacement),
        message="Đã hủy thanh toán.",
    )


@router.post(
    "/payments/{payment_id}/approve-manual",
    response_model=ApiResponse,
    summary="Xác nhận thanh toán thủ công (Staff/Admin)",
)
async def approve_payment_manual(
    payment_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    if payment.status not in ("CREATED", "PENDING"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thanh toán không ở trạng thái chờ để duyệt.")

    _validate_target_type(payment.target_type)

    try:
        await confirm_payment_success(payment, db)
    except ScheduleConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    await db.commit()
    await db.refresh(payment)
    return ApiResponse(
        data=_payment_response(payment),
        message="Thanh toán đã được duyệt thủ công thành công.",
    )


@router.post(
    "/payments/{payment_id}/cancel-manual",
    response_model=ApiResponse,
    summary="Hủy thanh toán thủ công (Staff/Admin)",
)
async def cancel_payment_manual(
    payment_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    if payment.status not in ("CREATED", "PENDING"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thanh toán không ở trạng thái có thể hủy.")

    payment.status = "CANCELLED"

    # Revert target status if applicable
    if payment.target_type == "PRIVATE_TUTORING_REQUEST":
        from app.models.private_tutoring_request import PrivateTutoringRequest
        req_res = await db.execute(
            select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == payment.target_id)
        )
        req = req_res.scalar_one_or_none()
        if req and req.status == "PAYMENT_PENDING":
            req.status = "TUTOR_CONFIRMED"
    elif payment.target_type == "CLASS_REGISTRATION":
        from app.models.class_registration import ClassRegistration
        reg_res = await db.execute(
            select(ClassRegistration).where(ClassRegistration.id == payment.target_id)
        )
        reg = reg_res.scalar_one_or_none()
        if reg and reg.status == "PAYMENT_PENDING":
            reg.status = "APPROVED"

    replacement = Payment(
        student_account_id=payment.student_account_id,
        target_type=payment.target_type,
        target_id=payment.target_id,
        contract_id=payment.contract_id,
        amount=payment.amount,
        currency=payment.currency,
        billing_cycle_label=payment.billing_cycle_label,
        status="CREATED",
    )
    db.add(replacement)
    await enrich_payment_with_sepay(replacement, db)

    await db.commit()
    await db.refresh(replacement)
    return ApiResponse(
        data=_payment_response(replacement),
        message="Thanh toán đã được hủy thủ công.",
    )


@router.post(
    "/payments/{payment_id}/refund",
    response_model=ApiResponse,
    summary="Hoàn tiền thanh toán (Staff/Admin)",
)
async def refund_payment(
    payment_id: int,
    body: PaymentRefund,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    if payment.status != "SUCCEEDED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ có thể hoàn tiền các giao dịch thành công.")
    if body.refund_amount > payment.amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Số tiền hoàn không thể lớn hơn số tiền thanh toán.")

    payment.status = "REFUNDED"
    payment.refund_amount = body.refund_amount
    payment.refund_reason = body.refund_reason

    # Revert target status if applicable, but only for full refunds
    if body.refund_amount == payment.amount:
        if payment.target_type == "PRIVATE_TUTORING_REQUEST":
            from app.models.private_tutoring_request import PrivateTutoringRequest
            req_res = await db.execute(
                select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == payment.target_id)
            )
            req = req_res.scalar_one_or_none()
            if req:
                req.status = "REFUNDED"
        elif payment.target_type == "CLASS_REGISTRATION":
            from app.models.class_registration import ClassRegistration
            reg_res = await db.execute(
                select(ClassRegistration).where(ClassRegistration.id == payment.target_id)
            )
            reg = reg_res.scalar_one_or_none()
            if reg:
                reg.status = "REFUNDED"

    await db.commit()
    await db.refresh(payment)
    return ApiResponse(
        data=_payment_response(payment),
        message="Đã hoàn tiền.",
    )


# ── Review ───────────────────────────────────────────────


@router.post(
    "/reviews",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đánh giá gia sư",
)
async def create_review(
    body: ReviewCreate,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    _validate_target_type(body.target_type)

    if body.target_type == "PRIVATE_TUTORING_REQUEST":
        from app.models.private_tutoring_request import PrivateTutoringRequest

        req_result = await db.execute(
            select(PrivateTutoringRequest).where(
                PrivateTutoringRequest.id == body.target_id,
                PrivateTutoringRequest.student_account_id == current_user.id,
            )
        )
        req = req_result.scalar_one_or_none()
        if not req:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu 1-1.")
        if req.tutor_id != body.tutor_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gia sư không khớp yêu cầu 1-1.")
        if req.status not in ("PAID", "ONGOING", "COMPLETED"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu chưa đủ điều kiện đánh giá.")
    else:
        from app.models.class_registration import ClassRegistration
        from app.models.course_class import CourseClass

        reg_result = await db.execute(
            select(ClassRegistration).where(
                ClassRegistration.id == body.target_id,
                ClassRegistration.student_account_id == current_user.id,
            )
        )
        reg = reg_result.scalar_one_or_none()
        if not reg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đăng ký lớp.")

        class_result = await db.execute(
            select(CourseClass).where(CourseClass.id == reg.class_id)
        )
        course_class = class_result.scalar_one_or_none()
        if not course_class:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp học.")
        if course_class.primary_tutor_id and course_class.primary_tutor_id != body.tutor_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gia sư không khớp lớp học.")
        if reg.status not in ("PAID",) and course_class.status not in ("ONGOING", "COMPLETED"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đăng ký chưa đủ điều kiện đánh giá.")

    # Check duplicate
    existing = await db.execute(
        select(Review).where(
            Review.student_account_id == current_user.id,
            Review.target_type == body.target_type,
            Review.target_id == body.target_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Bạn đã đánh giá rồi.")

    review = Review(
        student_account_id=current_user.id,
        tutor_id=body.tutor_id,
        target_type=body.target_type,
        target_id=body.target_id,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(review)

    # Update tutor average rating
    tutor_result = await db.execute(
        select(TutorProfile).where(TutorProfile.id == body.tutor_id)
    )
    tutor = tutor_result.scalar_one_or_none()
    if tutor:
        total_rating = float(tutor.average_rating) * tutor.rating_count + body.rating
        tutor.rating_count += 1
        tutor.average_rating = round(total_rating / tutor.rating_count, 2)

    await db.commit()
    await db.refresh(review)
    return ApiResponse(
        data=ReviewResponse.model_validate(review),
        message="Đánh giá thành công.",
    )


@router.get("/reviews/tutor/{tutor_id}", response_model=ApiResponse, summary="Xem đánh giá gia sư")
async def list_tutor_reviews(
    tutor_id: int,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review).where(Review.tutor_id == tutor_id).order_by(Review.created_at.desc())
    )
    reviews = result.scalars().all()
    return ApiResponse(data=[ReviewResponse.model_validate(r) for r in reviews])


@router.get("/reviews/my", response_model=ApiResponse, summary="Đánh giá của tôi")
async def list_my_reviews(
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review)
        .where(Review.student_account_id == current_user.id)
        .order_by(Review.created_at.desc())
    )
    reviews = result.scalars().all()

    if not reviews:
        return ApiResponse(data=[])

    # Enrich with tutor_name & subject_name
    from app.models.private_tutoring_request import PrivateTutoringRequest
    from app.models.class_registration import ClassRegistration
    from app.models.course_class import CourseClass
    from app.models.subject import Subject

    tutor_ids = list({r.tutor_id for r in reviews})
    tutor_info: dict[int, tuple[str, str | None]] = {}
    if tutor_ids:
        tutor_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name, UserAccount.avatar_url)
            .join(UserAccount, TutorProfile.account_id == UserAccount.id)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        for tid, name, avatar in tutor_result:
            tutor_info[tid] = (name, avatar)

    # Get subject names from targets
    private_targets = {r.target_id for r in reviews if r.target_type == "PRIVATE_TUTORING_REQUEST"}
    class_targets = {r.target_id for r in reviews if r.target_type == "CLASS_REGISTRATION"}

    subject_map: dict[tuple[str, int], str] = {}

    if private_targets:
        req_result = await db.execute(
            select(PrivateTutoringRequest.id, Subject.name)
            .join(Subject, PrivateTutoringRequest.subject_id == Subject.id)
            .where(PrivateTutoringRequest.id.in_(private_targets))
        )
        for rid, sname in req_result:
            subject_map[("PRIVATE_TUTORING_REQUEST", rid)] = sname

    if class_targets:
        reg_result = await db.execute(
            select(ClassRegistration.id, Subject.name)
            .join(CourseClass, ClassRegistration.class_id == CourseClass.id)
            .join(Subject, CourseClass.subject_id == Subject.id)
            .where(ClassRegistration.id.in_(class_targets))
        )
        for rid, sname in reg_result:
            subject_map[("CLASS_REGISTRATION", rid)] = sname

    enriched = []
    for r in reviews:
        resp = ReviewResponse.model_validate(r)
        info = tutor_info.get(r.tutor_id)
        if info:
            resp.tutor_name, resp.tutor_avatar_url = info
        resp.subject_name = subject_map.get((r.target_type, r.target_id))
        enriched.append(resp)

    return ApiResponse(data=enriched)
