"""Private tutoring request API — create, confirm, reject, list."""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.notifications import create_notification
from app.core.deps import get_current_user, get_db, require_role
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.message import Message
from app.models.message_thread import MessageThread
from app.models.message_thread_participant import MessageThreadParticipant
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.schedule_pattern import SchedulePattern
from app.models.subject import Subject
from app.models.teaching_contract import TeachingContract
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.schemas.private_request import (
    PrivateRequestCreate,
    PrivateRequestResponse,
    PrivateRequestScheduleResponse,
    TutorConfirmRequest,
    TutorRejectRequest,
    UpdateLocationRequest,
)
from app.services.private_schedule import (
    ScheduleConflictError,
    ensure_private_schedule_available,
)
from app.services.sepay import enrich_payment_with_sepay

router = APIRouter(prefix="/private-requests", tags=["Private Tutoring"])

CONTACT_VISIBLE_STATUSES = frozenset(
    {"SCHEDULE_PROPOSED", "TUTOR_CONFIRMED", "PAID", "ONGOING", "COMPLETED"}
)

LOCATION_UPDATE_ALLOWED_STATUSES = frozenset(
    {"SCHEDULE_PROPOSED", "TUTOR_CONFIRMED", "PAID", "ONGOING"}
)


def _can_view_tutor_contact(user: UserAccount, req: PrivateTutoringRequest) -> bool:
    return user.role in ("STAFF", "SUPER_ADMIN") or (
        user.role == "STUDENT"
        and req.student_account_id == user.id
        and req.status in CONTACT_VISIBLE_STATUSES
    )


def _can_view_student_contact(user: UserAccount, req: PrivateTutoringRequest) -> bool:
    return user.role in ("STAFF", "SUPER_ADMIN") or (
        user.role == "TUTOR"
        and user.tutor_profile is not None
        and req.tutor_id == user.tutor_profile.id
        and req.status in CONTACT_VISIBLE_STATUSES
    )


async def _attach_private_request_schedule_info(
    resp: PrivateRequestResponse,
    req_id: int,
    db: AsyncSession,
) -> None:
    class_result = await db.execute(
        select(CourseClass.id, CourseClass.location)
        .where(CourseClass.private_request_id == req_id)
        .limit(1)
    )
    class_row = class_result.one_or_none()
    class_id = class_row[0] if class_row else None
    resp.class_location = class_row[1] if class_row else None

    filters = [SchedulePattern.private_request_id == req_id]
    if class_id:
        filters.append(SchedulePattern.class_id == class_id)
    patterns_result = await db.execute(
        select(SchedulePattern)
        .where(or_(*filters))
        .order_by(SchedulePattern.start_date, SchedulePattern.start_time, SchedulePattern.id)
    )
    patterns = patterns_result.scalars().all()
    seen: set[int] = set()
    resp.schedules = []
    for pattern in patterns:
        if pattern.id in seen:
            continue
        seen.add(pattern.id)
        resp.schedules.append(PrivateRequestScheduleResponse.model_validate(pattern))


# ── Student: create & list ───────────────────────────────


@router.post(
    "",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Gửi yêu cầu học 1-1",
)
async def create_request(
    body: PrivateRequestCreate,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    # Verify tutor is VERIFIED
    result = await db.execute(
        select(TutorProfile).where(TutorProfile.id == body.tutor_id)
    )
    tutor = result.scalar_one_or_none()
    if not tutor or tutor.verification_status != "VERIFIED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gia sư chưa được xác minh.")

    subject_result = await db.execute(select(Subject).where(Subject.id == body.subject_id))
    subject = subject_result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy môn học.")

    tutor_account_result = await db.execute(select(UserAccount).where(UserAccount.id == tutor.account_id))
    tutor_account = tutor_account_result.scalar_one_or_none()
    if not tutor_account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản gia sư.")

    if body.learning_need_id is not None:
        need_result = await db.execute(
            select(LearningNeed).where(
                LearningNeed.id == body.learning_need_id,
                LearningNeed.student_account_id == current_user.id,
            )
        )
        if not need_result.scalar_one_or_none():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhu cầu học.")

    req = PrivateTutoringRequest(
        student_account_id=current_user.id,
        **body.model_dump(),
    )
    db.add(req)
    await db.flush()

    thread = MessageThread(
        private_request_id=req.id,
        title=f"Yêu cầu 1-1: {subject.name} - {req.grade_level}",
    )
    db.add(thread)
    await db.flush()

    await _ensure_message_thread_participants(thread.id, [current_user.id, tutor_account.id], db)

    initial_message = Message(
        thread_id=thread.id,
        sender_id=current_user.id,
        content=_build_initial_private_request_message(req, subject.name),
    )
    db.add(initial_message)

    await create_notification(
        db,
        user_id=tutor_account.id,
        notification_type="NEW_PRIVATE_REQUEST",
        title=f"Yêu cầu học 1-1 mới từ {current_user.full_name}",
        body=f"{subject.name} - {req.grade_level} · {req.requested_sessions} buổi",
        reference_type="message_thread",
        reference_id=thread.id,
    )

    thread_id = thread.id
    tutor_name = tutor_account.full_name
    subject_name = subject.name

    await db.commit()
    await db.refresh(req)

    resp = PrivateRequestResponse.model_validate(req)
    resp.thread_id = thread_id
    resp.tutor_name = tutor_name
    resp.tutor_avatar_url = tutor_account.avatar_url
    resp.student_name = current_user.full_name
    resp.student_avatar_url = current_user.avatar_url
    resp.subject_name = subject_name
    await _attach_private_request_schedule_info(resp, req.id, db)

    return ApiResponse(
        data=resp,
        message="Đã gửi yêu cầu học 1-1.",
    )


@router.get("", response_model=ApiResponse, summary="Danh sách yêu cầu 1-1 của tôi")
async def list_my_requests(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Show requests where user is student OR tutor (via tutor_profile)
    # STAFF and SUPER_ADMIN see all requests
    if current_user.role in ("STAFF", "SUPER_ADMIN"):
        filters = []
    elif current_user.role == "TUTOR" and current_user.tutor_profile:
        filters = [
            or_(
                PrivateTutoringRequest.student_account_id == current_user.id,
                PrivateTutoringRequest.tutor_id == current_user.tutor_profile.id,
            )
        ]
    else:
        filters = [PrivateTutoringRequest.student_account_id == current_user.id]

    result = await db.execute(
        select(PrivateTutoringRequest)
        .where(*filters)
        .order_by(PrivateTutoringRequest.created_at.desc())
    )
    reqs = result.scalars().all()

    tutor_ids = {r.tutor_id for r in reqs}
    student_ids = {r.student_account_id for r in reqs}
    subject_ids = {r.subject_id for r in reqs}

    tutor_accounts: dict[int, dict[str, str | None]] = {}
    if tutor_ids:
        tp_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
            .join(UserAccount, TutorProfile.account_id == UserAccount.id)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        tutor_accounts = {
            row[0]: {"name": row[1], "phone": row[2], "address": row[3], "avatar_url": row[4]}
            for row in tp_result.all()
        }

    student_accounts: dict[int, dict[str, str | None]] = {}
    if student_ids:
        st_result = await db.execute(
            select(UserAccount.id, UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
            .where(UserAccount.id.in_(student_ids))
        )
        student_accounts = {
            row[0]: {"name": row[1], "phone": row[2], "address": row[3], "avatar_url": row[4]}
            for row in st_result.all()
        }

    subject_names: dict[int, str] = {}
    if subject_ids:
        sub_result = await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids))
        )
        subject_names = {row[0]: row[1] for row in sub_result.all()}

    data = []
    for r in reqs:
        resp = PrivateRequestResponse.model_validate(r)
        tutor_account = tutor_accounts.get(r.tutor_id, {})
        student_account = student_accounts.get(r.student_account_id, {})
        resp.tutor_name = tutor_account.get("name")
        resp.tutor_avatar_url = tutor_account.get("avatar_url")
        resp.student_name = student_account.get("name")
        resp.student_avatar_url = student_account.get("avatar_url")
        resp.subject_name = subject_names.get(r.subject_id)
        if _can_view_tutor_contact(current_user, r):
            resp.tutor_phone = tutor_account.get("phone")
            resp.tutor_address = tutor_account.get("address")
        if _can_view_student_contact(current_user, r):
            resp.student_phone = student_account.get("phone")
            resp.student_address = student_account.get("address")
        await _attach_private_request_schedule_info(resp, r.id, db)
        data.append(resp)

    return ApiResponse(data=data)


@router.get("/{req_id}", response_model=ApiResponse, summary="Chi tiết yêu cầu 1-1")
async def get_request(
    req_id: int,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == req_id)

    if current_user.role == "TUTOR":
        if not current_user.tutor_profile:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có hồ sơ gia sư.")
        query = query.where(PrivateTutoringRequest.tutor_id == current_user.tutor_profile.id)
    elif current_user.role == "STUDENT":
        query = query.where(PrivateTutoringRequest.student_account_id == current_user.id)
    elif current_user.role not in ("STAFF", "SUPER_ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")

    result = await db.execute(query)
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu.")

    resp = PrivateRequestResponse.model_validate(req)

    tutor_result = await db.execute(
        select(TutorProfile.id, UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
        .join(UserAccount, TutorProfile.account_id == UserAccount.id)
        .where(TutorProfile.id == req.tutor_id)
    )
    tutor_account = tutor_result.one_or_none()
    if tutor_account:
        resp.tutor_name = tutor_account[1]
        resp.tutor_avatar_url = tutor_account[4]
        if _can_view_tutor_contact(current_user, req):
            resp.tutor_phone = tutor_account[2]
            resp.tutor_address = tutor_account[3]

    student_result = await db.execute(
        select(UserAccount.id, UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
        .where(UserAccount.id == req.student_account_id)
    )
    student_account = student_result.one_or_none()
    if student_account:
        resp.student_name = student_account[1]
        resp.student_avatar_url = student_account[4]
        if _can_view_student_contact(current_user, req):
            resp.student_phone = student_account[2]
            resp.student_address = student_account[3]

    subject_result = await db.execute(select(Subject.id, Subject.name).where(Subject.id == req.subject_id))
    subject = subject_result.one_or_none()
    if subject:
        resp.subject_name = subject[1]

    await _attach_private_request_schedule_info(resp, req.id, db)
    return ApiResponse(data=resp)


@router.get(
    "/{req_id}/student-profile",
    response_model=ApiResponse,
    summary="Tutor xem hồ sơ học viên (từ yêu cầu 1-1)",
)
async def get_student_profile(
    req_id: int,
    current_user: UserAccount = Depends(require_role("TUTOR", "STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Return the student profile info + learning history for a given request."""
    from app.models.subject import Subject
    from app.models.teaching_contract import TeachingContract

    # Get the request
    query = select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == req_id)
    if current_user.role == "TUTOR":
        if not current_user.tutor_profile:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có hồ sơ gia sư.")
        query = query.where(PrivateTutoringRequest.tutor_id == current_user.tutor_profile.id)

    result = await db.execute(query)
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu.")

    # Get student info
    student_result = await db.execute(
        select(UserAccount).where(UserAccount.id == req.student_account_id)
    )
    student = student_result.scalar_one()
    contact_visible = _can_view_student_contact(current_user, req)

    # Get all requests from this student (learning history)
    history_result = await db.execute(
        select(PrivateTutoringRequest, Subject.name)
        .join(Subject, PrivateTutoringRequest.subject_id == Subject.id)
        .where(PrivateTutoringRequest.student_account_id == student.id)
        .order_by(PrivateTutoringRequest.created_at.desc())
    )
    history = []
    for row in history_result.all():
        r, subject_name = row
        history.append({
            "id": r.id,
            "subject_name": subject_name,
            "grade_level": r.grade_level,
            "goal": r.goal,
            "requested_sessions": r.requested_sessions,
            "status": r.status,
            "mode": r.mode,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    # Count completed contracts (via private requests)
    contract_count_result = await db.execute(
        select(func.count())
        .select_from(TeachingContract)
        .join(
            PrivateTutoringRequest,
            TeachingContract.private_request_id == PrivateTutoringRequest.id,
        )
        .where(PrivateTutoringRequest.student_account_id == student.id)
    )
    completed_contracts = contract_count_result.scalar() or 0

    profile_data = {
        "student_id": student.id,
        "full_name": student.full_name,
        "avatar_url": student.avatar_url,
        "email": student.email if contact_visible else None,
        "phone": student.phone if contact_visible else None,
        "birth_year": student.birth_year,
        "address": student.address if contact_visible else None,
        "school": student.school,
        "academic_level": student.academic_level,
        "learning_style": student.learning_style,
        "parent_notes": student.parent_notes,
        "contact_visible": contact_visible,
        "created_at": student.created_at.isoformat() if student.created_at else None,
        "total_contracts": completed_contracts,
        "request_history": history,
    }

    return ApiResponse(data=profile_data)


# ── Tutor: confirm / reject ─────────────────────────────


@router.post("/{req_id}/confirm", response_model=ApiResponse, summary="Gia sư xác nhận yêu cầu")
async def confirm_request(
    req_id: int,
    body: TutorConfirmRequest,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    req = await _get_request_for_tutor(req_id, current_user, db)
    if req.status != "SENT":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu không ở trạng thái SENT.")

    agreed_sessions = body.agreed_sessions or req.requested_sessions
    class_title = body.class_title.strip() if body.class_title and body.class_title.strip() else None
    schedules = body.schedules or []
    if not schedules:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vui lòng đề xuất ít nhất một lịch học.")
    for schedule in schedules:
        if schedule.end_time <= schedule.start_time:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Giờ kết thúc phải sau giờ bắt đầu.")

    try:
        await ensure_private_schedule_available(
            tutor_id=req.tutor_id,
            schedules=schedules,
            db=db,
            exclude_private_request_id=req.id,
        )
    except ScheduleConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    req.status = "SCHEDULE_PROPOSED"
    req.requested_sessions = agreed_sessions
    req.agreed_fee_per_session = body.agreed_fee_per_session
    req.tutor_response_note = body.response_note
    req.confirmed_at = datetime.utcnow()

    # 1. Create a private 1-1 class after both sides agree.
    subject_result = await db.execute(select(Subject).where(Subject.id == req.subject_id))
    subject = subject_result.scalar_one_or_none()
    subject_name = subject.name if subject else f"Môn #{req.subject_id}"

    course_class, _contract = await _ensure_private_class_and_contract(
        req=req,
        subject_name=subject_name,
        class_title=class_title,
        location=body.location,
        actor=current_user,
        db=db,
    )
    await _replace_private_schedule_patterns(req, course_class, schedules, db)

    thread = await _append_private_request_status_message(
        req,
        current_user,
        subject_name,
        db,
        status_kind="SCHEDULE_PROPOSED",
    )

    await db.commit()
    await db.refresh(req)
    resp = PrivateRequestResponse.model_validate(req)
    resp.subject_name = subject_name
    resp.thread_id = thread.id
    student_result = await db.execute(
        select(UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
        .where(UserAccount.id == req.student_account_id)
    )
    student_account = student_result.one_or_none()
    if student_account:
        resp.student_name = student_account[0]
        resp.student_phone = student_account[1]
        resp.student_address = student_account[2]
        resp.student_avatar_url = student_account[3]
    await _attach_private_request_schedule_info(resp, req.id, db)
    return ApiResponse(
        data=resp,
        message="Đã gửi lịch đề xuất cho học viên xác nhận.",
    )


@router.post(
    "/{req_id}/accept-schedule",
    response_model=ApiResponse,
    summary="Học viên đồng ý lịch đề xuất 1-1",
)
async def accept_private_schedule(
    req_id: int,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PrivateTutoringRequest).where(
            PrivateTutoringRequest.id == req_id,
            PrivateTutoringRequest.student_account_id == current_user.id,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu.")
    if req.status != "SCHEDULE_PROPOSED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu không ở trạng thái chờ học viên đồng ý lịch.")
    if not req.agreed_fee_per_session:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu chưa có học phí thỏa thuận.")

    patterns_result = await db.execute(
        select(SchedulePattern.id).where(SchedulePattern.private_request_id == req.id).limit(1)
    )
    if patterns_result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gia sư chưa đề xuất lịch học.")

    subject_result = await db.execute(select(Subject).where(Subject.id == req.subject_id))
    subject = subject_result.scalar_one_or_none()
    subject_name = subject.name if subject else f"Môn #{req.subject_id}"

    course_class, contract = await _ensure_private_class_and_contract(
        req=req,
        subject_name=subject_name,
        class_title=None,
        location=None,
        actor=current_user,
        db=db,
    )
    await _ensure_private_payment(req, contract, db)

    tutor_account_id = await _get_tutor_account_id(req.tutor_id, db)
    thread = await _append_private_request_status_message(
        req,
        current_user,
        subject_name,
        db,
        status_kind="STUDENT_ACCEPTED_SCHEDULE",
        thread_tutor_account_id=tutor_account_id,
        notify_user_id=tutor_account_id,
    )

    await db.commit()
    await db.refresh(req)
    resp = PrivateRequestResponse.model_validate(req)
    resp.subject_name = subject_name
    resp.thread_id = thread.id
    resp.student_name = current_user.full_name
    resp.student_avatar_url = current_user.avatar_url
    resp.class_location = course_class.location
    await _attach_private_request_schedule_info(resp, req.id, db)
    return ApiResponse(
        data=resp,
        message="Đã đồng ý lịch học. Bạn có thể thanh toán để lịch chính thức hiển thị.",
    )


@router.patch("/{req_id}/location", response_model=ApiResponse, summary="Cập nhật phòng/link học 1-1")
async def update_request_location(
    req_id: int,
    body: UpdateLocationRequest,
    current_user: UserAccount = Depends(require_role("TUTOR", "STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "TUTOR":
        req = await _get_request_for_tutor(req_id, current_user, db)
    else:
        result = await db.execute(
            select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == req_id)
        )
        req = result.scalar_one_or_none()
        if not req:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu.")

    if req.status not in LOCATION_UPDATE_ALLOWED_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Trạng thái yêu cầu không cho phép cập nhật phòng/link học.")

    location = body.location.strip()
    if not location:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vui lòng nhập phòng/link học.")

    class_result = await db.execute(
        select(CourseClass)
        .where(CourseClass.private_request_id == req.id)
        .limit(1)
    )
    course_class = class_result.scalar_one_or_none()
    if not course_class:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu chưa có lớp 1-1 để cập nhật phòng/link học.")

    subject_result = await db.execute(select(Subject).where(Subject.id == req.subject_id))
    subject = subject_result.scalar_one_or_none()
    subject_name = subject.name if subject else f"Môn #{req.subject_id}"

    tutor_account_id = await _get_tutor_account_id(req.tutor_id, db)
    if tutor_account_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản gia sư.")

    course_class.location = location
    thread = await _ensure_private_request_thread(req, subject_name, tutor_account_id, db)
    content = f"Gia sư đã cập nhật phòng/link học:\n{location}"
    thread.updated_at = datetime.utcnow()
    db.add(Message(thread_id=thread.id, sender_id=current_user.id, content=content))

    await create_notification(
        db,
        user_id=req.student_account_id,
        notification_type="NEW_MESSAGE",
        title="Phòng/link học đã được cập nhật",
        body=content[:160],
        reference_type="message_thread",
        reference_id=thread.id,
    )

    thread_id = thread.id
    await db.commit()
    await db.refresh(req)

    resp = PrivateRequestResponse.model_validate(req)
    resp.subject_name = subject_name
    resp.thread_id = thread_id

    tutor_result = await db.execute(
        select(TutorProfile.id, UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
        .join(UserAccount, TutorProfile.account_id == UserAccount.id)
        .where(TutorProfile.id == req.tutor_id)
    )
    tutor_account = tutor_result.one_or_none()
    if tutor_account:
        resp.tutor_name = tutor_account[1]
        resp.tutor_avatar_url = tutor_account[4]
        if _can_view_tutor_contact(current_user, req):
            resp.tutor_phone = tutor_account[2]
            resp.tutor_address = tutor_account[3]

    student_result = await db.execute(
        select(UserAccount.id, UserAccount.full_name, UserAccount.phone, UserAccount.address, UserAccount.avatar_url)
        .where(UserAccount.id == req.student_account_id)
    )
    student_account = student_result.one_or_none()
    if student_account:
        resp.student_name = student_account[1]
        resp.student_avatar_url = student_account[4]
        if _can_view_student_contact(current_user, req):
            resp.student_phone = student_account[2]
            resp.student_address = student_account[3]

    await _attach_private_request_schedule_info(resp, req.id, db)
    return ApiResponse(data=resp, message="Đã cập nhật phòng/link học.")

@router.post("/{req_id}/reject", response_model=ApiResponse, summary="Gia sư từ chối yêu cầu")
async def reject_request(
    req_id: int,
    body: TutorRejectRequest,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    req = await _get_request_for_tutor(req_id, current_user, db)
    if req.status != "SENT":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu không ở trạng thái SENT.")

    req.status = "TUTOR_REJECTED"
    req.tutor_response_note = body.response_note

    subject_result = await db.execute(select(Subject).where(Subject.id == req.subject_id))
    subject = subject_result.scalar_one_or_none()
    subject_name = subject.name if subject else f"Môn #{req.subject_id}"
    thread = await _append_private_request_status_message(
        req,
        current_user,
        subject_name,
        db,
        status_kind="REJECTED",
    )

    await db.commit()
    await db.refresh(req)
    resp = PrivateRequestResponse.model_validate(req)
    resp.subject_name = subject_name
    resp.thread_id = thread.id
    await _attach_private_request_schedule_info(resp, req.id, db)
    return ApiResponse(data=resp, message="Đã từ chối yêu cầu.")


# ── Helpers ──────────────────────────────────────────────


async def _ensure_private_class_and_contract(
    *,
    req: PrivateTutoringRequest,
    subject_name: str,
    class_title: str | None,
    location: str | None,
    actor: UserAccount,
    db: AsyncSession,
) -> tuple[CourseClass, TeachingContract]:
    class_result = await db.execute(
        select(CourseClass).where(CourseClass.private_request_id == req.id)
    )
    course_class = class_result.scalar_one_or_none()
    if not course_class:
        course_class = CourseClass(
            private_request_id=req.id,
            subject_id=req.subject_id,
            primary_tutor_id=req.tutor_id,
            title=class_title or f"1-1 {subject_name} - {req.grade_level}",
            grade_level=req.grade_level,
            goal=req.goal,
            fee_per_session_per_student=req.agreed_fee_per_session,
            total_sessions=req.requested_sessions,
            min_students=1,
            max_students=1,
            mode=req.mode,
            location=location,
            status="READY",
            created_by_account_id=actor.id,
        )
        db.add(course_class)
        await db.flush()
    else:
        course_class.primary_tutor_id = req.tutor_id
        if class_title:
            course_class.title = class_title
        course_class.fee_per_session_per_student = req.agreed_fee_per_session
        course_class.total_sessions = req.requested_sessions
        course_class.mode = req.mode
        if location is not None:
            course_class.location = location
        course_class.status = "READY"

    registration_result = await db.execute(
        select(ClassRegistration).where(
            ClassRegistration.class_id == course_class.id,
            ClassRegistration.student_account_id == req.student_account_id,
        )
    )
    registration = registration_result.scalar_one_or_none()
    if not registration:
        registration = ClassRegistration(
            class_id=course_class.id,
            student_account_id=req.student_account_id,
            learning_need_id=req.learning_need_id,
            status="APPROVED",
            reviewed_by_account_id=actor.id,
            reviewed_at=datetime.utcnow(),
            review_note="Tự động duyệt sau khi gia sư xác nhận yêu cầu 1-1.",
        )
        db.add(registration)

    contract_result = await db.execute(
        select(TeachingContract).where(TeachingContract.private_request_id == req.id)
    )
    contract = contract_result.scalar_one_or_none()
    if not contract:
        from app.services.settings import get_commission_rates

        center_rate, tutor_rate = await get_commission_rates(db)
        contract = TeachingContract(
            tutor_id=req.tutor_id,
            private_request_id=req.id,
            class_id=course_class.id,
            commission_name_snapshot="Default Commission",
            center_rate_snapshot=center_rate,
            tutor_rate_snapshot=tutor_rate,
        )
        db.add(contract)
        await db.flush()
    else:
        contract.class_id = course_class.id

    return course_class, contract


async def _replace_private_schedule_patterns(
    req: PrivateTutoringRequest,
    course_class: CourseClass,
    schedules: list,
    db: AsyncSession,
) -> None:
    await db.execute(
        delete(SchedulePattern).where(
            or_(
                SchedulePattern.private_request_id == req.id,
                SchedulePattern.class_id == course_class.id,
            )
        )
    )

    start_dates: list[date] = []
    explicit_end_dates: list[date] = []
    for schedule in schedules:
        total_sessions = schedule.total_sessions or req.requested_sessions
        pattern = SchedulePattern(
            private_request_id=req.id,
            class_id=course_class.id,
            day_of_week=schedule.day_of_week,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
            start_date=schedule.start_date,
            end_date=schedule.end_date,
            total_sessions=total_sessions,
        )
        db.add(pattern)
        start_dates.append(schedule.start_date)
        if schedule.end_date:
            explicit_end_dates.append(schedule.end_date)

    if start_dates:
        course_class.start_date = min(start_dates)
        course_class.end_date = max(explicit_end_dates) if explicit_end_dates else None


async def _ensure_private_payment(
    req: PrivateTutoringRequest,
    contract: TeachingContract,
    db: AsyncSession,
) -> Payment:
    if not req.agreed_fee_per_session:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu chưa có học phí thỏa thuận.")

    req.status = "TUTOR_CONFIRMED"
    amount = req.agreed_fee_per_session * req.requested_sessions
    payment_result = await db.execute(
        select(Payment)
        .where(
            Payment.target_type == "PRIVATE_TUTORING_REQUEST",
            Payment.target_id == req.id,
            Payment.status.in_(("CREATED", "PENDING")),
        )
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    payment = payment_result.scalar_one_or_none()
    if not payment:
        payment = Payment(
            student_account_id=req.student_account_id,
            target_type="PRIVATE_TUTORING_REQUEST",
            target_id=req.id,
            contract_id=contract.id,
            amount=amount,
            status="CREATED",
        )
        db.add(payment)
        await enrich_payment_with_sepay(payment, db)
    else:
        payment.amount = amount
        payment.contract_id = contract.id
    return payment


async def _get_tutor_account_id(tutor_id: int, db: AsyncSession) -> int | None:
    result = await db.execute(
        select(TutorProfile.account_id).where(TutorProfile.id == tutor_id)
    )
    return result.scalar_one_or_none()


def _build_initial_private_request_message(req: PrivateTutoringRequest, subject_name: str) -> str:
    mode_label = "Trực tuyến" if req.mode == "ONLINE" else "Trực tiếp" if req.mode == "OFFLINE" else req.mode
    lines = [
        "Yêu cầu học 1-1 mới",
        f"Môn: {subject_name} - {req.grade_level}",
        f"Số buổi dự kiến: {req.requested_sessions}",
        f"Hình thức: {mode_label}",
    ]
    if req.goal and req.goal.strip():
        lines.append(f"Nội dung: {req.goal.strip()}")
    lines.extend([
        "",
        "Chào thầy/cô, em muốn đăng ký học 1-1. Mong thầy/cô xem xét và phản hồi giúp em nhé!",
    ])
    return "\n".join(lines)


def _format_vnd(value: Decimal | int | str | None) -> str:
    amount = Decimal(str(value or 0))
    return f"{amount:,.0f}".replace(",", ".") + "đ"


def _build_private_request_status_message(
    req: PrivateTutoringRequest,
    subject_name: str,
    *,
    status_kind: str,
) -> str:
    if status_kind in ("CONFIRMED", "SCHEDULE_PROPOSED", "STUDENT_ACCEPTED_SCHEDULE"):
        fee = req.agreed_fee_per_session or Decimal("0")
        total = fee * Decimal(req.requested_sessions)
        if status_kind == "SCHEDULE_PROPOSED":
            headline = "Gia sư đã xác nhận yêu cầu và đề xuất lịch học."
        elif status_kind == "STUDENT_ACCEPTED_SCHEDULE":
            headline = "Học viên đã đồng ý lịch học đề xuất."
        else:
            headline = "Gia sư đã xác nhận yêu cầu."
        lines = [
            headline,
            f"Môn: {subject_name} - {req.grade_level}",
            f"Học phí: {_format_vnd(fee)}/buổi",
            f"Số buổi: {req.requested_sessions}",
            f"Tổng: {_format_vnd(total)}",
        ]
        if status_kind == "SCHEDULE_PROPOSED":
            lines.append("Học viên cần kiểm tra lịch và bấm đồng ý trước khi thanh toán.")
        if status_kind == "STUDENT_ACCEPTED_SCHEDULE":
            lines.append("Hệ thống đã mở bước thanh toán cho học viên.")
        if req.tutor_response_note and req.tutor_response_note.strip():
            lines.append(f"Ghi chú: {req.tutor_response_note.strip()}")
        return "\n".join(lines)

    lines = [
        "Gia sư đã từ chối yêu cầu này.",
        f"Môn: {subject_name} - {req.grade_level}",
    ]
    if req.tutor_response_note and req.tutor_response_note.strip():
        lines.append(f"Lý do: {req.tutor_response_note.strip()}")
    return "\n".join(lines)


async def _ensure_message_thread_participants(
    thread_id: int,
    account_ids: list[int],
    db: AsyncSession,
) -> None:
    if not account_ids:
        return
    unique_ids = list(dict.fromkeys(account_ids))
    existing_result = await db.execute(
        select(MessageThreadParticipant.account_id).where(
            MessageThreadParticipant.thread_id == thread_id,
            MessageThreadParticipant.account_id.in_(unique_ids),
        )
    )
    existing_ids = {row[0] for row in existing_result.all()}
    for account_id in unique_ids:
        if account_id not in existing_ids:
            db.add(MessageThreadParticipant(thread_id=thread_id, account_id=account_id))


async def _ensure_private_request_thread(
    req: PrivateTutoringRequest,
    subject_name: str,
    tutor_account_id: int,
    db: AsyncSession,
) -> MessageThread:
    result = await db.execute(
        select(MessageThread)
        .where(MessageThread.private_request_id == req.id)
        .order_by(MessageThread.created_at.asc(), MessageThread.id.asc())
        .limit(1)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        thread = MessageThread(
            private_request_id=req.id,
            title=f"Yêu cầu 1-1: {subject_name} - {req.grade_level}",
        )
        db.add(thread)
        await db.flush()

    await _ensure_message_thread_participants(
        thread.id,
        [req.student_account_id, tutor_account_id],
        db,
    )
    return thread


async def _append_private_request_status_message(
    req: PrivateTutoringRequest,
    actor: UserAccount,
    subject_name: str,
    db: AsyncSession,
    *,
    status_kind: str,
    thread_tutor_account_id: int | None = None,
    notify_user_id: int | None = None,
) -> MessageThread:
    thread = await _ensure_private_request_thread(
        req,
        subject_name,
        thread_tutor_account_id or actor.id,
        db,
    )
    content = _build_private_request_status_message(req, subject_name, status_kind=status_kind)
    message = Message(thread_id=thread.id, sender_id=actor.id, content=content)
    thread.updated_at = datetime.utcnow()
    db.add(message)
    await db.flush()

    await create_notification(
        db,
        user_id=notify_user_id or req.student_account_id,
        notification_type="NEW_MESSAGE",
        title="Yêu cầu 1-1 đã được cập nhật",
        body=content[:160],
        reference_type="message_thread",
        reference_id=thread.id,
    )
    return thread


async def _get_request_for_tutor(
    req_id: int, user: UserAccount, db: AsyncSession
) -> PrivateTutoringRequest:
    profile = user.tutor_profile
    if not profile:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có hồ sơ gia sư.")
    result = await db.execute(
        select(PrivateTutoringRequest).where(
            PrivateTutoringRequest.id == req_id,
            PrivateTutoringRequest.tutor_id == profile.id,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu.")
    if profile.verification_status != "VERIFIED":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hồ sơ của bạn chưa được duyệt. Bạn không thể thực hiện thao tác này.")
    return req
