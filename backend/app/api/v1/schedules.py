"""Schedule, session, and contract management API."""

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_session import LearningSession
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.schedule_block import ScheduleBlock
from app.models.schedule_pattern import SchedulePattern
from app.models.teaching_contract import TeachingContract
from app.models.payment import Payment
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.api.v1.notifications import create_notification, create_notifications_bulk
from app.services.audit import log_audit
from app.services.class_completion import (
    complete_course_class_if_all_sessions_completed,
    complete_private_request_if_all_sessions_completed,
)
from app.schemas.common import ApiResponse
from app.schemas.schedule import (
    LearningSessionResponse,
    SchedulePatternCreate,
    SchedulePatternResponse,
    SessionAttendanceUpdate,
    TeachingContractCreate,
    TeachingContractResponse,
    ContractCommissionUpdate,
)

router = APIRouter(tags=["Schedule & Contracts"])


# ── Schedule Patterns ────────────────────────────────────


@router.post(
    "/schedules",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo lịch học lặp lại + sinh buổi học + khóa lịch",
)
async def create_schedule_pattern(
    body: SchedulePatternCreate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    # Validate XOR
    if not body.private_request_id and not body.class_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần chỉ định private_request_id hoặc class_id.")
    if body.private_request_id and body.class_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ được chọn 1 trong 2.")

    pattern = SchedulePattern(**body.model_dump())
    db.add(pattern)
    await db.flush()

    # ── Auto-generate sessions ───────────────────────────
    tutor_id = await _resolve_tutor_id(body, db)
    sessions = _generate_sessions(body, tutor_id, pattern)

    for sess in sessions:
        db.add(sess)

    # ── Auto-create schedule block ───────────────────────
    block = ScheduleBlock(
        tutor_id=tutor_id,
        private_request_id=body.private_request_id,
        class_id=body.class_id,
        day_of_week=body.day_of_week,
        start_time=body.start_time,
        end_time=body.end_time,
    )
    db.add(block)

    # ── Tạo notification cho student(s) + tutor ──────────
    notify_user_ids = await _resolve_session_user_ids(body, tutor_id, db)
    if sessions:
        first = sessions[0]
        await create_notifications_bulk(
            db,
            user_ids=notify_user_ids,
            notification_type="SESSION_REMINDER",
            title=f"Lịch học mới: {len(sessions)} buổi đã được tạo",
            body=f"Buổi đầu tiên vào ngày {first.session_date.strftime('%d/%m/%Y')}, "
                 f"{first.start_time.strftime('%H:%M')} - {first.end_time.strftime('%H:%M')}.",
            reference_type="learning_session",
            reference_id=first.id if hasattr(first, 'id') and first.id else None,
        )

    await db.commit()
    await db.refresh(pattern)
    return ApiResponse(
        data={
            "pattern": SchedulePatternResponse.model_validate(pattern).model_dump(),
            "sessions_created": len(sessions),
        },
        message=f"Tạo lịch thành công, đã sinh {len(sessions)} buổi học.",
    )


@router.get(
    "/schedules",
    response_model=ApiResponse,
    summary="Danh sách lịch học",
)
async def list_schedules(
    private_request_id: int | None = None,
    class_id: int | None = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("STAFF", "SUPER_ADMIN"):
        if not private_request_id and not class_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cần lọc theo request hoặc class.")

        if current_user.role == "TUTOR" and not current_user.tutor_profile:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có hồ sơ gia sư.")

        if private_request_id:
            req_result = await db.execute(
                select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == private_request_id)
            )
            req = req_result.scalar_one_or_none()
            if not req:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu 1-1.")
            if current_user.role == "STUDENT" and req.student_account_id != current_user.id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")
            if current_user.role == "TUTOR" and req.tutor_id != current_user.tutor_profile.id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")

        if class_id:
            class_result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
            course_class = class_result.scalar_one_or_none()
            if not course_class:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp học.")
            if current_user.role == "STUDENT":
                # Allow students to view schedules for classes open for enrollment
                if course_class.status not in ("ENROLLING", "READY"):
                    reg_result = await db.execute(
                        select(ClassRegistration).where(
                            ClassRegistration.class_id == class_id,
                            ClassRegistration.student_account_id == current_user.id,
                        )
                    )
                    if not reg_result.scalar_one_or_none():
                        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")
            elif current_user.role == "TUTOR":
                if course_class.primary_tutor_id != current_user.tutor_profile.id:
                    raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")

    query = select(SchedulePattern)
    if private_request_id:
        query = query.where(SchedulePattern.private_request_id == private_request_id)
    if class_id:
        query = query.where(SchedulePattern.class_id == class_id)
    result = await db.execute(query)
    patterns = result.scalars().all()
    return ApiResponse(data=[SchedulePatternResponse.model_validate(p) for p in patterns])


# ── Learning Sessions ────────────────────────────────────


@router.get("/sessions", response_model=ApiResponse, summary="Danh sách buổi học")
async def list_sessions(
    private_request_id: int | None = None,
    class_id: int | None = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_

    query = select(LearningSession).order_by(LearningSession.session_date)

    if current_user.role == "STUDENT":
        if not private_request_id and not class_id:
            # Lấy tất cả lịch học của học viên
            req_query = select(PrivateTutoringRequest.id).where(
                PrivateTutoringRequest.student_account_id == current_user.id,
                PrivateTutoringRequest.status.in_(("PAID", "ONGOING", "COMPLETED")),
            )
            class_query = select(ClassRegistration.class_id).where(
                ClassRegistration.student_account_id == current_user.id,
                ClassRegistration.status == "PAID",
            )
            query = query.where(
                or_(
                    LearningSession.private_request_id.in_(req_query),
                    LearningSession.class_id.in_(class_query),
                )
            )
        else:
            if private_request_id:
                req_result = await db.execute(
                    select(PrivateTutoringRequest).where(
                        PrivateTutoringRequest.id == private_request_id,
                        PrivateTutoringRequest.student_account_id == current_user.id,
                        PrivateTutoringRequest.status.in_(("PAID", "ONGOING", "COMPLETED")),
                    )
                )
                if not req_result.scalar_one_or_none():
                    raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")
                query = query.where(LearningSession.private_request_id == private_request_id)

            if class_id:
                reg_result = await db.execute(
                    select(ClassRegistration).where(
                        ClassRegistration.class_id == class_id,
                        ClassRegistration.student_account_id == current_user.id,
                        ClassRegistration.status == "PAID",
                    )
                )
                if not reg_result.scalar_one_or_none():
                    raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")
                query = query.where(LearningSession.class_id == class_id)
    else:
        # Staff, Admin, Tutor
        if private_request_id:
            query = query.where(LearningSession.private_request_id == private_request_id)
        if class_id:
            query = query.where(LearningSession.class_id == class_id)

        # Tutor: only their sessions
        if current_user.role == "TUTOR" and current_user.tutor_profile:
            query = query.where(LearningSession.tutor_id == current_user.tutor_profile.id)

    result = await db.execute(query)
    sessions = result.scalars().all()

    # Enrich with tutor names and class titles
    from app.models.tutor_profile import TutorProfile

    tutor_ids = {s.tutor_id for s in sessions}
    class_ids = {s.class_id for s in sessions if s.class_id}
    req_ids = {s.private_request_id for s in sessions if s.private_request_id}

    tutor_names: dict[int, str] = {}
    if tutor_ids:
        tp_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name)
            .join(UserAccount, TutorProfile.account_id == UserAccount.id)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        tutor_names = {row[0]: row[1] for row in tp_result.all()}

    class_info: dict[int, dict[str, object]] = {}
    if class_ids:
        cc_result = await db.execute(
            select(
                CourseClass.id,
                CourseClass.title,
                CourseClass.mode,
                CourseClass.location,
                CourseClass.total_sessions,
                CourseClass.goal,
            )
            .where(CourseClass.id.in_(class_ids))
        )
        class_info = {
            row[0]: {
                "title": row[1],
                "mode": row[2],
                "location": row[3],
                "target_total_sessions": row[4],
                "target_goal": row[5],
            }
            for row in cc_result.all()
        }

        class_student_result = await db.execute(
            select(ClassRegistration.class_id, UserAccount.full_name)
            .join(UserAccount, ClassRegistration.student_account_id == UserAccount.id)
            .where(
                ClassRegistration.class_id.in_(class_ids),
                ClassRegistration.status == "PAID",
            )
            .order_by(UserAccount.full_name)
        )
        class_students: dict[int, list[str]] = {}
        for class_id_value, full_name in class_student_result.all():
            class_students.setdefault(class_id_value, []).append(full_name)
        for class_id_value, student_names in class_students.items():
            if class_id_value in class_info:
                class_info[class_id_value]["student_names"] = student_names
                class_info[class_id_value]["student_count"] = len(student_names)

    req_info: dict[int, dict[str, object]] = {}
    if req_ids:
        from app.models.subject import Subject
        req_result = await db.execute(
            select(
                PrivateTutoringRequest.id,
                Subject.name,
                PrivateTutoringRequest.grade_level,
                PrivateTutoringRequest.mode,
                CourseClass.location,
                PrivateTutoringRequest.requested_sessions,
                PrivateTutoringRequest.goal,
                UserAccount.full_name,
            )
            .join(Subject, PrivateTutoringRequest.subject_id == Subject.id)
            .join(UserAccount, PrivateTutoringRequest.student_account_id == UserAccount.id)
            .outerjoin(CourseClass, CourseClass.private_request_id == PrivateTutoringRequest.id)
            .where(PrivateTutoringRequest.id.in_(req_ids))
        )
        req_info = {
            row[0]: {
                "title": f"{row[1]} - {row[2]}",
                "mode": row[3],
                "location": row[4],
                "target_total_sessions": row[5],
                "target_goal": row[6],
                "student_names": [row[7]] if row[7] else [],
                "student_count": 1 if row[7] else 0,
            }
            for row in req_result.all()
        }

    data = []
    for s in sessions:
        resp = LearningSessionResponse.model_validate(s)
        resp.tutor_name = tutor_names.get(s.tutor_id)
        if s.class_id:
            info = class_info.get(s.class_id)
            if info:
                resp.class_title = info.get("title") if isinstance(info.get("title"), str) else None
                resp.mode = info.get("mode") if isinstance(info.get("mode"), str) else None
                resp.location = info.get("location") if isinstance(info.get("location"), str) else None
                resp.student_names = info.get("student_names") if isinstance(info.get("student_names"), list) else []
                resp.student_count = info.get("student_count") if isinstance(info.get("student_count"), int) else len(resp.student_names)
                resp.target_total_sessions = info.get("target_total_sessions") if isinstance(info.get("target_total_sessions"), int) else None
                resp.target_goal = info.get("target_goal") if isinstance(info.get("target_goal"), str) else None
        if s.private_request_id:
            info = req_info.get(s.private_request_id)
            if info:
                title = info.get("title")
                mode = info.get("mode")
                location = info.get("location")
                resp.private_request_title = title if isinstance(title, str) else None
                resp.mode = resp.mode or (mode if isinstance(mode, str) else None)
                resp.location = resp.location or (location if isinstance(location, str) else None)
                resp.student_names = info.get("student_names") if isinstance(info.get("student_names"), list) else []
                resp.student_count = info.get("student_count") if isinstance(info.get("student_count"), int) else len(resp.student_names)
                resp.target_total_sessions = info.get("target_total_sessions") if isinstance(info.get("target_total_sessions"), int) else None
                resp.target_goal = info.get("target_goal") if isinstance(info.get("target_goal"), str) else None
        data.append(resp)

    return ApiResponse(data=data)


@router.put(
    "/sessions/{session_id}/attendance",
    response_model=ApiResponse,
    summary="Gia sư điểm danh buổi học",
)
async def update_attendance(
    session_id: int,
    body: SessionAttendanceUpdate,
    current_user: UserAccount = Depends(require_role("TUTOR", "STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy buổi học.")

    # Tutor can only update their own sessions
    if current_user.role == "TUTOR":
        if not current_user.tutor_profile or session.tutor_id != current_user.tutor_profile.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không phải buổi học của bạn.")

    if body.status not in ("COMPLETED", "CANCELLED", "NO_SHOW"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Status phải là COMPLETED, CANCELLED hoặc NO_SHOW.")

    old_status = session.status
    session.status = body.status
    session.attendance_note = body.attendance_note

    if body.status == "COMPLETED":
        if session.class_id:
            await complete_course_class_if_all_sessions_completed(session.class_id, db)
        elif session.private_request_id:
            await complete_private_request_if_all_sessions_completed(session.private_request_id, db)

    # ── Tạo notification khi hủy buổi học ────────────────
    if body.status == "CANCELLED" and old_status != "CANCELLED":
        notify_ids = await _resolve_session_notify_ids(session, db)
        session_label = f"Buổi {session.session_number or ''} ngày {session.session_date.strftime('%d/%m/%Y')}"
        await create_notifications_bulk(
            db,
            user_ids=notify_ids,
            notification_type="SESSION_CANCELLED",
            title=f"Buổi học đã bị hủy",
            body=f"{session_label} ({session.start_time.strftime('%H:%M')} - {session.end_time.strftime('%H:%M')}) đã bị hủy."
                 + (f" Lý do: {body.attendance_note}" if body.attendance_note else ""),
            reference_type="learning_session",
            reference_id=session.id,
        )

    await db.commit()
    await db.refresh(session)
    return ApiResponse(
        data=LearningSessionResponse.model_validate(session),
        message=f"Đã cập nhật buổi học sang {body.status}.",
    )


# ── Teaching Contracts ───────────────────────────────────


@router.post(
    "/contracts",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Staff tạo hợp đồng giảng dạy",
)
async def create_contract(
    body: TeachingContractCreate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    contract = TeachingContract(**body.model_dump())
    db.add(contract)
    await db.commit()
    await db.refresh(contract)
    return ApiResponse(
        data=TeachingContractResponse.model_validate(contract),
        message="Tạo hợp đồng thành công.",
    )


@router.get("/contracts", response_model=ApiResponse, summary="Danh sách hợp đồng")
async def list_contracts(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TeachingContract).order_by(TeachingContract.created_at.desc())
    if current_user.role == "TUTOR" and current_user.tutor_profile:
        query = query.where(TeachingContract.tutor_id == current_user.tutor_profile.id)
    result = await db.execute(query)
    contracts = result.scalars().all()

    enriched_contracts = []
    if contracts:
        from app.models.tutor_profile import TutorProfile
        from app.models.user_account import UserAccount
        from app.models.private_tutoring_request import PrivateTutoringRequest
        from app.models.course_class import CourseClass

        # Pre-fetch Tutors
        tutor_ids = {c.tutor_id for c in contracts}
        tutors = {}
        if tutor_ids:
            tutor_query = select(TutorProfile.id, UserAccount.full_name).join(
                UserAccount, TutorProfile.account_id == UserAccount.id
            ).where(TutorProfile.id.in_(tutor_ids))
            tutor_result = await db.execute(tutor_query)
            for t_id, name in tutor_result:
                tutors[t_id] = name

        # Pre-fetch Requests
        req_ids = {c.private_request_id for c in contracts if c.private_request_id}
        reqs = {}
        if req_ids:
            req_query = select(PrivateTutoringRequest.id, PrivateTutoringRequest.requested_sessions).where(PrivateTutoringRequest.id.in_(req_ids))
            req_result = await db.execute(req_query)
            for r_id, sessions in req_result:
                reqs[r_id] = f"Yêu cầu 1-1 ({sessions} buổi)"

        # Pre-fetch Classes
        class_ids = {c.class_id for c in contracts if c.class_id}
        classes = {}
        if class_ids:
            class_query = select(CourseClass.id, CourseClass.title).where(CourseClass.id.in_(class_ids))
            class_result = await db.execute(class_query)
            for c_id, title in class_result:
                classes[c_id] = title

        for c in contracts:
            resp = TeachingContractResponse.model_validate(c)
            resp.tutor_name = tutors.get(c.tutor_id)
            if c.private_request_id:
                resp.target_name = reqs.get(c.private_request_id)
            elif c.class_id:
                resp.target_name = classes.get(c.class_id)
            enriched_contracts.append(resp)
    else:
        enriched_contracts = []

    return ApiResponse(data=enriched_contracts)


@router.put(
    "/contracts/{contract_id}/status",
    response_model=ApiResponse,
    summary="Staff cập nhật trạng thái hợp đồng",
)
async def update_contract_status(
    contract_id: int,
    new_status: str,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeachingContract).where(TeachingContract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hợp đồng.")
    contract.status = new_status
    await db.commit()
    await db.refresh(contract)
    return ApiResponse(
        data=TeachingContractResponse.model_validate(contract),
        message=f"Đã cập nhật hợp đồng sang {new_status}.",
    )


@router.put(
    "/contracts/{contract_id}/commission",
    response_model=ApiResponse,
    summary="Cập nhật tỷ lệ hoa hồng hợp đồng",
)
async def update_contract_commission(
    contract_id: int,
    body: ContractCommissionUpdate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.center_rate + body.tutor_rate != Decimal("100"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tổng tỷ lệ phải bằng 100.")

    result = await db.execute(select(TeachingContract).where(TeachingContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hợp đồng.")

    payment_result = await db.execute(
        select(Payment.id).where(
            Payment.contract_id == contract_id,
            or_(
                Payment.center_amount_snapshot.is_not(None),
                Payment.tutor_amount_snapshot.is_not(None),
            ),
        ).limit(1)
    )
    if payment_result.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể sửa tỷ lệ khi đã có thanh toán thành công.")

    old_center = contract.center_rate_snapshot
    old_tutor = contract.tutor_rate_snapshot

    contract.center_rate_snapshot = body.center_rate
    contract.tutor_rate_snapshot = body.tutor_rate
    contract.commission_name_snapshot = "Tùy chỉnh"

    log_audit(
        db=db,
        actor=current_user,
        action="UPDATE_COMMISSION",
        target_type="TEACHING_CONTRACT",
        target_id=contract.id,
        detail={
            "old_center_rate": str(old_center),
            "old_tutor_rate": str(old_tutor),
            "new_center_rate": str(body.center_rate),
            "new_tutor_rate": str(body.tutor_rate),
            "reason": body.reason,
        },
    )

    await db.commit()
    await db.refresh(contract)
    return ApiResponse(
        data=TeachingContractResponse.model_validate(contract),
        message="Đã cập nhật tỷ lệ hoa hồng."
    )


# ── Schedule Blocks ──────────────────────────────────────


@router.get("/schedule-blocks", response_model=ApiResponse, summary="Danh sách khung giờ đã khoá")
async def list_schedule_blocks(
    tutor_id: int | None = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("STAFF", "SUPER_ADMIN"):
        if current_user.role == "TUTOR" and current_user.tutor_profile:
            if tutor_id and tutor_id != current_user.tutor_profile.id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")
            tutor_id = current_user.tutor_profile.id
        else:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")

    query = select(ScheduleBlock).where(ScheduleBlock.status == "ACTIVE")
    if tutor_id:
        query = query.where(ScheduleBlock.tutor_id == tutor_id)
    elif current_user.role == "TUTOR" and current_user.tutor_profile:
        query = query.where(ScheduleBlock.tutor_id == current_user.tutor_profile.id)
    result = await db.execute(query)
    blocks = result.scalars().all()
    data = [
        {
            "id": b.id, "tutor_id": b.tutor_id,
            "day_of_week": b.day_of_week,
            "start_time": str(b.start_time), "end_time": str(b.end_time),
            "status": b.status,
        }
        for b in blocks
    ]
    return ApiResponse(data=data)


# ── Helpers ──────────────────────────────────────────────


async def _resolve_session_user_ids(
    body: SchedulePatternCreate, tutor_id: int, db: AsyncSession
) -> list[int]:
    """Lấy danh sách user_id (student + tutor account_id) cần nhận notification."""
    user_ids: list[int] = []

    # Tutor account_id
    tp_result = await db.execute(
        select(TutorProfile.account_id).where(TutorProfile.id == tutor_id)
    )
    tutor_account_id = tp_result.scalar_one_or_none()
    if tutor_account_id:
        user_ids.append(tutor_account_id)

    # Student(s)
    if body.private_request_id:
        req_result = await db.execute(
            select(PrivateTutoringRequest.student_account_id)
            .where(
                PrivateTutoringRequest.id == body.private_request_id,
                PrivateTutoringRequest.status.in_(("PAID", "ONGOING", "COMPLETED")),
            )
        )
        student_id = req_result.scalar_one_or_none()
        if student_id:
            user_ids.append(student_id)
    elif body.class_id:
        reg_result = await db.execute(
            select(ClassRegistration.student_account_id)
            .where(
                ClassRegistration.class_id == body.class_id,
                ClassRegistration.status == "PAID",
            )
        )
        for row in reg_result.scalars().all():
            user_ids.append(row)

    return list(set(user_ids))


async def _resolve_session_notify_ids(
    session: LearningSession, db: AsyncSession
) -> list[int]:
    """Lấy danh sách user_id cần nhận notification cho 1 session cụ thể."""
    user_ids: list[int] = []

    # Tutor
    tp_result = await db.execute(
        select(TutorProfile.account_id).where(TutorProfile.id == session.tutor_id)
    )
    tutor_account_id = tp_result.scalar_one_or_none()
    if tutor_account_id:
        user_ids.append(tutor_account_id)

    # Student(s)
    if session.private_request_id:
        req_result = await db.execute(
            select(PrivateTutoringRequest.student_account_id)
            .where(
                PrivateTutoringRequest.id == session.private_request_id,
                PrivateTutoringRequest.status.in_(("PAID", "ONGOING", "COMPLETED")),
            )
        )
        student_id = req_result.scalar_one_or_none()
        if student_id:
            user_ids.append(student_id)
    elif session.class_id:
        reg_result = await db.execute(
            select(ClassRegistration.student_account_id)
            .where(
                ClassRegistration.class_id == session.class_id,
                ClassRegistration.status == "PAID",
            )
        )
        for row in reg_result.scalars().all():
            user_ids.append(row)

    return list(set(user_ids))


async def _resolve_tutor_id(body: SchedulePatternCreate, db: AsyncSession) -> int:
    """Resolve tutor_id from private_request or class."""
    if body.private_request_id:
        from app.models.private_tutoring_request import PrivateTutoringRequest
        result = await db.execute(
            select(PrivateTutoringRequest).where(
                PrivateTutoringRequest.id == body.private_request_id
            )
        )
        req = result.scalar_one_or_none()
        if not req:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu 1-1.")
        return req.tutor_id
    else:
        from app.models.course_class import CourseClass
        result = await db.execute(
            select(CourseClass).where(CourseClass.id == body.class_id)
        )
        cc = result.scalar_one_or_none()
        if not cc or not cc.primary_tutor_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lớp chưa có gia sư chính.")
        return cc.primary_tutor_id


def _generate_sessions(
    body: SchedulePatternCreate,
    tutor_id: int,
    pattern: SchedulePattern,
) -> list[LearningSession]:
    """Generate individual learning sessions from a weekly pattern."""
    sessions: list[LearningSession] = []

    # Map day_of_week (1=Mon, 7=Sun) to Python weekday (0=Mon, 6=Sun)
    target_weekday = body.day_of_week - 1
    total = body.total_sessions or 12  # default 12 sessions

    current_date = body.start_date
    # Find first matching weekday
    while current_date.weekday() != target_weekday:
        current_date += timedelta(days=1)

    session_num = 0
    while session_num < total:
        if body.end_date and current_date > body.end_date:
            break

        session_num += 1
        session = LearningSession(
            private_request_id=body.private_request_id,
            class_id=body.class_id,
            tutor_id=tutor_id,
            session_number=session_num,
            session_date=current_date,
            start_time=body.start_time,
            end_time=body.end_time,
        )
        sessions.append(session)
        current_date += timedelta(weeks=1)

    return sessions
