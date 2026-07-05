"""Course classes API — CRUD, tutor applications, student registrations."""

from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db, require_role
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.subject import Subject
from app.models.tutor_application import TutorApplication
from app.models.tutor_profile import TutorProfile
from app.models.tutor_subject import TutorSubject
from app.models.teaching_contract import TeachingContract
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.schemas.course_class import (
    ClassRegistrationCreate,
    ClassRegistrationResponse,
    CourseClassCreate,
    CourseClassResponse,
    CourseClassUpdate,
    TutorApplicationCreate,
    TutorApplicationResponse,
)
from app.services.sepay import enrich_payment_with_sepay
from app.services.recommendation import check_grade_level_match
from app.services.location import best_location_match_level
from app.services.class_completion import (
    CLASS_STATUSES,
    COMPLETABLE_CLASS_STATUSES,
    complete_course_class,
)
from app.schemas.staff import ReviewAction

router = APIRouter(prefix="/classes", tags=["Course Classes"])


# ── Staff: CRUD ──────────────────────────────────────────


@router.post(
    "",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Staff tạo lớp nhóm",
)
async def create_class(
    body: CourseClassCreate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    schedules_data = body.schedules or []
    class_data = body.model_dump(exclude={"schedules"})

    # Auto calculate end_date if start_date and schedules are present
    if class_data.get("start_date") and schedules_data:
        class_data["end_date"] = calculate_class_end_date(
            class_data["start_date"],
            class_data["total_sessions"],
            schedules_data
        )

    cc = CourseClass(
        created_by_account_id=current_user.id,
        **class_data,
    )
    db.add(cc)
    await db.flush()

    # Create schedule patterns
    from app.models.schedule_pattern import SchedulePattern
    for s in schedules_data:
        s_start = s.start_date or cc.start_date or date.today()
        s_end = s.end_date or s_start or cc.end_date
        s_tot = s.total_sessions or (1 if s.start_date else cc.total_sessions)

        pattern = SchedulePattern(
            class_id=cc.id,
            day_of_week=s.day_of_week,
            start_time=s.start_time,
            end_time=s.end_time,
            start_date=s_start,
            end_date=s_end,
            total_sessions=s_tot,
        )
        db.add(pattern)

    await db.commit()
    await db.refresh(cc)
    return ApiResponse(
        data=CourseClassResponse.model_validate(cc),
        message="Tạo lớp nhóm thành công.",
    )


@router.get("", response_model=ApiResponse, summary="Danh sách lớp nhóm")
async def list_classes(
    q: str | None = None,
    mode: str | None = None,
    subject_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    status_filter: str | None = None,
    for_tutor: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    query = select(CourseClass)

    if current_user.role == "STUDENT":
        query = query.where(CourseClass.private_request_id.is_(None))
        if not status_filter:
            query = query.where(
                CourseClass.status.in_(("ENROLLING", "READY", "ONGOING", "COMPLETED"))
            )
    elif current_user.role == "TUTOR" and current_user.tutor_profile and not for_tutor:
        query = query.where(
            or_(
                CourseClass.private_request_id.is_(None),
                CourseClass.primary_tutor_id == current_user.tutor_profile.id,
            )
        )

    # Filter by status if provided
    if status_filter:
        query = query.where(CourseClass.status == status_filter)

    # Filter by mode if provided
    if mode and mode != "ALL":
        if mode == "ONLINE":
            query = query.where(CourseClass.mode.in_(("ONLINE", "BOTH")))
        elif mode == "OFFLINE":
            query = query.where(CourseClass.mode.in_(("OFFLINE", "BOTH")))

    # Filter by subject_id if provided
    if subject_id:
        query = query.where(CourseClass.subject_id == subject_id)

    # For tutor: only show classes matching their subjects and grade levels
    tutor_subjects = []
    if for_tutor and current_user.role == "TUTOR" and current_user.tutor_profile:
        tutor_subject_result = await db.execute(
            select(TutorSubject).where(
                TutorSubject.tutor_id == current_user.tutor_profile.id,
                TutorSubject.status == "APPROVED"
            )
        )
        tutor_subjects = tutor_subject_result.scalars().all()
        if not tutor_subjects:
            # Tutor has no approved subjects registered, return empty
            return ApiResponse(data=[], message="Bạn chưa có môn dạy nào được duyệt. Vui lòng đăng ký môn dạy và chờ Staff duyệt.")
        tutor_subject_ids = list({ts.subject_id for ts in tutor_subjects})
        query = query.where(CourseClass.subject_id.in_(tutor_subject_ids))
        # Also default to TUTOR_RECRUITING for tutor view
        if not status_filter:
            query = query.where(CourseClass.status == "TUTOR_RECRUITING")

    result = await db.execute(query)
    classes = list(result.scalars().all())

    # Filter by grade level in memory for tutor if needed
    if for_tutor and current_user.role == "TUTOR" and current_user.tutor_profile and tutor_subjects:
        filtered_classes = []
        for c in classes:
            matching_ts_list = [ts for ts in tutor_subjects if ts.subject_id == c.subject_id]
            grade_matched = False
            for ts in matching_ts_list:
                if not c.grade_level or not ts.grade_level:
                    grade_matched = True
                    break
                if check_grade_level_match(c.grade_level, ts.grade_level):
                    grade_matched = True
                    break
            if grade_matched:
                filtered_classes.append(c)
        classes = filtered_classes

    # Fetch subject names
    subject_ids = {c.subject_id for c in classes}
    subject_info: dict[int, str] = {}
    if subject_ids:
        from app.models.subject import Subject
        sub_result = await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids))
        )
        subject_info = {row[0]: row[1] for row in sub_result.all()}

    # Exact Search AND matching & sorting
    from app.services.search import tokenize, search_classes
    query_tokens = tokenize(q) if q else []

    if q is not None and q.strip() and not query_tokens:
        return ApiResponse(data=[])

    if q and query_tokens:
        classes = search_classes(classes, q, query_tokens, subject_info)
    else:
        if current_user.role == "STUDENT":
            status_rank = {
                "ENROLLING": 4,
                "READY": 3,
                "ONGOING": 2,
                "COMPLETED": 1,
            }
            classes.sort(
                key=lambda course: (
                    best_location_match_level(current_user.address, course.location),
                    status_rank.get(course.status, 0),
                    course.created_at or datetime.min,
                ),
                reverse=True,
            )
        else:
            classes.sort(key=lambda course: course.created_at or datetime.min, reverse=True)

    paginated_classes = classes[offset : offset + limit]

    # Enrich with tutor names and avatars
    tutor_ids = {c.primary_tutor_id for c in paginated_classes if c.primary_tutor_id}
    tutor_info: dict[int, tuple[str, str | None]] = {}
    if tutor_ids:
        tp_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name, UserAccount.avatar_url)
            .join(UserAccount, TutorProfile.account_id == UserAccount.id)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        tutor_info = {row[0]: (row[1], row[2]) for row in tp_result.all()}

    data = []
    for c in paginated_classes:
        resp = CourseClassResponse.model_validate(c)
        if c.primary_tutor_id and c.primary_tutor_id in tutor_info:
            resp.tutor_name, resp.tutor_avatar_url = tutor_info[c.primary_tutor_id]
        if c.subject_id in subject_info:
            resp.subject_name = subject_info[c.subject_id]
        data.append(resp)

    return ApiResponse(data=data)



@router.get("/my-registrations", response_model=ApiResponse, summary="Danh sách lớp đã đăng ký của tôi")
async def list_my_registrations(
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    from app.models.subject import Subject

    result = await db.execute(
        select(ClassRegistration, CourseClass, Subject.name, UserAccount.full_name, UserAccount.avatar_url)
        .join(CourseClass, ClassRegistration.class_id == CourseClass.id)
        .join(Subject, CourseClass.subject_id == Subject.id)
        .outerjoin(TutorProfile, CourseClass.primary_tutor_id == TutorProfile.id)
        .outerjoin(UserAccount, TutorProfile.account_id == UserAccount.id)
        .where(ClassRegistration.student_account_id == current_user.id)
        .order_by(ClassRegistration.created_at.desc())
    )

    data = []
    for row in result.all():
        reg, course_class, subject_name, tutor_name, tutor_avatar_url = row
        resp = ClassRegistrationResponse.model_validate(reg)
        resp.private_request_id = course_class.private_request_id
        resp.class_title = course_class.title
        resp.tutor_name = tutor_name or "Chưa phân công"
        resp.tutor_avatar_url = tutor_avatar_url
        resp.subject_name = subject_name
        resp.total_sessions = course_class.total_sessions
        resp.fee_per_session_per_student = course_class.fee_per_session_per_student
        data.append(resp)

    return ApiResponse(data=data)


@router.get("/my-applications", response_model=ApiResponse, summary="Lịch sử ứng tuyển lớp của gia sư")
async def list_my_applications(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = current_user.tutor_profile
    if not profile:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không có hồ sơ gia sư.")

    result = await db.execute(
        select(TutorApplication, CourseClass, Subject.name)
        .join(CourseClass, TutorApplication.class_id == CourseClass.id)
        .join(Subject, CourseClass.subject_id == Subject.id)
        .where(TutorApplication.tutor_id == profile.id)
        .order_by(TutorApplication.created_at.desc())
    )

    data = []
    for app, course_class, subject_name in result.all():
        resp = TutorApplicationResponse.model_validate(app)
        resp.class_title = course_class.title
        resp.class_status = course_class.status
        resp.grade_level = course_class.grade_level
        resp.total_sessions = course_class.total_sessions
        resp.fee_per_session_per_student = course_class.fee_per_session_per_student
        resp.mode = course_class.mode
        resp.location = course_class.location
        resp.subject_name = subject_name
        data.append(resp)

    return ApiResponse(data=data)


async def _enrich_class_response(resp: CourseClassResponse, db: AsyncSession) -> CourseClassResponse:
    if resp.primary_tutor_id:
        t_res = await db.execute(
            select(UserAccount.full_name, UserAccount.avatar_url)
            .join(TutorProfile, TutorProfile.account_id == UserAccount.id)
            .where(TutorProfile.id == resp.primary_tutor_id)
        )
        t_row = t_res.first()
        if t_row:
            resp.tutor_name, resp.tutor_avatar_url = t_row

    # Enrich subject_name
    from app.models.subject import Subject
    s_res = await db.execute(
        select(Subject.name).where(Subject.id == resp.subject_id)
    )
    s_row = s_res.first()
    if s_row:
        resp.subject_name = s_row[0]

    return resp


@router.get("/{class_id}", response_model=ApiResponse, summary="Chi tiết lớp nhóm")
async def get_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    result = await db.execute(
        select(CourseClass).where(CourseClass.id == class_id)
    )
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")
    resp = CourseClassResponse.model_validate(cc)
    await _enrich_class_response(resp, db)
    return ApiResponse(data=resp)


@router.put("/{class_id}/status", response_model=ApiResponse, summary="Staff cập nhật trạng thái lớp")
async def update_class_status(
    class_id: int,
    new_status: str,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")
    if new_status not in CLASS_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Trạng thái lớp không hợp lệ.")
    if new_status in ("ENROLLING", "READY") and not cc.primary_tutor_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lớp phải có gia sư mới có thể mở đăng ký.")
    if new_status == "COMPLETED":
        if cc.status not in COMPLETABLE_CLASS_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Chỉ có thể kết thúc lớp ở trạng thái READY hoặc ONGOING.",
            )
        await complete_course_class(cc, db)
    else:
        cc.status = new_status
    await db.flush()
    await db.refresh(cc)
    resp = CourseClassResponse.model_validate(cc)
    await _enrich_class_response(resp, db)
    await db.commit()
    return ApiResponse(
        data=resp,
        message=f"Đã cập nhật trạng thái lớp sang {new_status}.",
    )


@router.put("/{class_id}", response_model=ApiResponse, summary="Staff cập nhật chi tiết lớp")
async def update_class(
    class_id: int,
    body: CourseClassUpdate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")

    # Check if there are registrations
    reg_result = await db.execute(
        select(func.count()).select_from(ClassRegistration).where(ClassRegistration.class_id == class_id)
    )
    has_registrations = reg_result.scalar_one() > 0

    update_data = body.model_dump(exclude_unset=True)

    # If has registrations, restrict some fields (skip for 1-1 private classes)
    is_private_class = cc.private_request_id is not None
    restricted_fields = ["subject_id", "fee_per_session_per_student", "total_sessions"]
    if has_registrations and not is_private_class:
        for field in restricted_fields:
            if field in update_data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Không thể thay đổi {field} vì lớp học đã có học viên đăng ký."
                )

    schedules_data = update_data.pop("schedules", None)

    for key, value in update_data.items():
        setattr(cc, key, value)

    # Auto calculate end_date if start_date or schedules or total_sessions changed
    schedules_for_calc = None
    if schedules_data is not None:
        schedules_for_calc = schedules_data
    elif any(k in update_data for k in ["start_date", "total_sessions"]):
        from app.models.schedule_pattern import SchedulePattern
        pats_result = await db.execute(select(SchedulePattern).where(SchedulePattern.class_id == class_id))
        schedules_for_calc = pats_result.scalars().all()

    if schedules_for_calc is not None and cc.start_date:
        cc.end_date = calculate_class_end_date(
            cc.start_date,
            cc.total_sessions,
            schedules_for_calc
        )

    # Update schedules if provided
    if schedules_data is not None:
        from app.models.schedule_pattern import SchedulePattern
        # Delete old schedules
        await db.execute(delete(SchedulePattern).where(SchedulePattern.class_id == class_id))
        # Add new schedules
        for s in schedules_data:
            s_start = s.get("start_date") or cc.start_date or date.today()
            s_end = s.get("end_date") or s_start or cc.end_date
            s_tot = s.get("total_sessions") or (1 if s.get("start_date") else cc.total_sessions)

            pattern = SchedulePattern(
                class_id=cc.id,
                private_request_id=cc.private_request_id,
                day_of_week=s["day_of_week"],
                start_time=s["start_time"],
                end_time=s["end_time"],
                start_date=s_start,
                end_date=s_end,
                total_sessions=s_tot,
            )
            db.add(pattern)
    elif any(k in update_data for k in ["start_date", "total_sessions"]):
        # Update existing schedule patterns to match new dates/sessions
        from app.models.schedule_pattern import SchedulePattern
        pats_result = await db.execute(select(SchedulePattern).where(SchedulePattern.class_id == class_id))
        for pattern in pats_result.scalars().all():
            pattern.start_date = cc.start_date or date.today()
            pattern.end_date = cc.end_date
            pattern.total_sessions = cc.total_sessions

    await db.flush()
    if cc.private_request_id:
        from app.models.private_tutoring_request import PrivateTutoringRequest
        from app.services.private_schedule import sync_private_request_sessions

        req_result = await db.execute(
            select(PrivateTutoringRequest).where(PrivateTutoringRequest.id == cc.private_request_id)
        )
        req = req_result.scalar_one_or_none()
        if req and req.status in ("PAID", "ONGOING", "COMPLETED"):
            await sync_private_request_sessions(req, db)

    refreshed_result = await db.execute(
        select(CourseClass)
        .options(selectinload(CourseClass.schedules))
        .where(CourseClass.id == class_id)
        .execution_options(populate_existing=True)
    )
    cc = refreshed_result.scalar_one()
    resp = CourseClassResponse.model_validate(cc)
    await _enrich_class_response(resp, db)
    await db.commit()
    return ApiResponse(
        data=resp,
        message="Cập nhật thông tin lớp học thành công."
    )


@router.delete("/{class_id}", response_model=ApiResponse, summary="Staff xóa lớp nhóm")
async def delete_class(
    class_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")

    # Check if there are registrations
    reg_result = await db.execute(
        select(func.count()).select_from(ClassRegistration).where(ClassRegistration.class_id == class_id)
    )
    if reg_result.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa lớp học này vì đã có học viên đăng ký. Vui lòng chuyển trạng thái lớp sang CANCELLED."
        )

    # Check if there are signed contracts
    contract_result = await db.execute(
        select(func.count()).select_from(TeachingContract).where(TeachingContract.class_id == class_id)
    )
    if contract_result.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa lớp học này vì đã phát sinh hợp đồng giảng dạy. Vui lòng chuyển trạng thái lớp sang CANCELLED."
        )

    # Delete related tutor applications first
    app_result = await db.execute(
        select(TutorApplication).where(TutorApplication.class_id == class_id)
    )
    for app in app_result.scalars().all():
        await db.delete(app)

    await db.delete(cc)
    await db.commit()
    return ApiResponse(message="Đã xóa lớp học thành công.")


# ── Tutor: apply ─────────────────────────────────────────


@router.post(
    "/{class_id}/apply",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Gia sư ứng tuyển vào lớp",
)
async def apply_to_class(
    class_id: int,
    body: TutorApplicationCreate,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = current_user.tutor_profile
    if not profile or profile.verification_status != "VERIFIED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gia sư chưa được xác minh.")

    # Check class exists and is recruiting
    result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")
    if cc.status != "TUTOR_RECRUITING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lớp không ở trạng thái tuyển gia sư.")

    subject_result = await db.execute(
        select(TutorSubject).where(
            TutorSubject.tutor_id == profile.id,
            TutorSubject.subject_id == cc.subject_id,
            TutorSubject.status == "APPROVED",
        )
    )
    tutor_subjects = subject_result.scalars().all()
    if not tutor_subjects:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bạn chưa có môn dạy phù hợp.")

    # Check if any approved subject matches the grade level
    grade_matched = False
    for ts in tutor_subjects:
        if not cc.grade_level or not ts.grade_level:
            grade_matched = True
            break
        if check_grade_level_match(cc.grade_level, ts.grade_level):
            grade_matched = True
            break

    if not grade_matched:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cấp lớp không phù hợp với lớp học.")

    # Check duplicate
    existing = await db.execute(
        select(TutorApplication).where(
            TutorApplication.class_id == class_id,
            TutorApplication.tutor_id == profile.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Bạn đã ứng tuyển lớp này rồi.")

    app = TutorApplication(class_id=class_id, tutor_id=profile.id, message=body.message)
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return ApiResponse(
        data=TutorApplicationResponse.model_validate(app),
        message="Ứng tuyển thành công.",
    )


@router.get("/{class_id}/applications", response_model=ApiResponse, summary="Danh sách ứng tuyển")
async def list_applications(
    class_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorApplication).where(TutorApplication.class_id == class_id)
    )
    apps = result.scalars().all()
    return ApiResponse(data=[TutorApplicationResponse.model_validate(a) for a in apps])


@router.post(
    "/{class_id}/applications/{app_id}/accept",
    response_model=ApiResponse,
    summary="Staff chọn gia sư cho lớp",
)
async def accept_application(
    class_id: int,
    app_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorApplication).where(
            TutorApplication.id == app_id, TutorApplication.class_id == class_id
        )
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ứng tuyển.")
    if app.status != "APPLIED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ứng tuyển không ở trạng thái APPLIED.")

    app.status = "ACCEPTED"
    app.reviewed_by_account_id = current_user.id
    app.reviewed_at = datetime.utcnow()
    # Set primary tutor on class
    result2 = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = result2.scalar_one()
    cc.primary_tutor_id = app.tutor_id

    from app.services.settings import get_commission_rates
    center_rate, tutor_rate = await get_commission_rates(db)

    contract_result = await db.execute(
        select(TeachingContract).where(
            TeachingContract.class_id == class_id,
            TeachingContract.tutor_id == app.tutor_id,
        )
    )
    contract = contract_result.scalar_one_or_none()
    if not contract:
        contract = TeachingContract(
            tutor_id=app.tutor_id,
            class_id=class_id,
            commission_name_snapshot="Default Commission",
            center_rate_snapshot=center_rate,
            tutor_rate_snapshot=tutor_rate,
        )
        db.add(contract)
        await db.flush()

    # Backfill contract_id for existing pending payments
    from app.models.payment import Payment
    from app.models.class_registration import ClassRegistration
    
    pending_payments_res = await db.execute(
        select(Payment)
        .join(ClassRegistration, Payment.target_id == ClassRegistration.id)
        .where(
            Payment.target_type == "CLASS_REGISTRATION",
            Payment.status.in_(("CREATED", "PENDING")),
            Payment.contract_id.is_(None),
            ClassRegistration.class_id == class_id
        )
    )
    for p in pending_payments_res.scalars().all():
        p.contract_id = contract.id

    # ── Auto-generate sessions & schedule blocks based on class schedule patterns ──
    from app.models.schedule_pattern import SchedulePattern
    patterns_result = await db.execute(
        select(SchedulePattern).where(SchedulePattern.class_id == class_id)
    )
    patterns = patterns_result.scalars().all()
    if patterns:
        from app.models.schedule_block import ScheduleBlock

        # Generate sessions using class-wide chronologically merged logic
        sessions = _generate_class_sessions(
            class_id=class_id,
            tutor_id=app.tutor_id,
            patterns=patterns,
            start_date=cc.start_date or date.today(),
            total_sessions=cc.total_sessions,
            end_date=cc.end_date,
        )
        for sess in sessions:
            db.add(sess)

        # Create schedule blocks for each pattern
        for pattern in patterns:
            block = ScheduleBlock(
                tutor_id=app.tutor_id,
                class_id=class_id,
                day_of_week=pattern.day_of_week,
                start_time=pattern.start_time,
                end_time=pattern.end_time,
            )
            db.add(block)

    await db.commit()
    await db.refresh(app)
    return ApiResponse(
        data=TutorApplicationResponse.model_validate(app),
        message="Đã chọn gia sư cho lớp.",
    )


# ── Student: register ────────────────────────────────────


@router.post(
    "/{class_id}/register",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Học viên đăng ký lớp nhóm",
)
async def register_for_class(
    class_id: int,
    body: ClassRegistrationCreate,
    current_user: UserAccount = Depends(require_role("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    # Check class exists and is enrolling
    result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")
    if cc.status not in ("ENROLLING", "READY"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lớp không nhận đăng ký.")

    # BD-408: check max students
    count_result = await db.execute(
        select(func.count()).where(
            ClassRegistration.class_id == class_id,
            ClassRegistration.status.in_(("PENDING", "APPROVED", "PAID")),
        )
    )
    current_count = count_result.scalar() or 0
    if current_count >= cc.max_students:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lớp đã đủ số lượng học viên.")

    # Check duplicate
    existing = await db.execute(
        select(ClassRegistration).where(
            ClassRegistration.class_id == class_id,
            ClassRegistration.student_account_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Bạn đã đăng ký lớp này rồi.")

    reg = ClassRegistration(
        class_id=class_id,
        student_account_id=current_user.id,
        learning_need_id=body.learning_need_id,
    )
    db.add(reg)
    await db.commit()
    await db.refresh(reg)
    return ApiResponse(
        data=ClassRegistrationResponse.model_validate(reg),
        message="Đăng ký lớp thành công, chờ staff duyệt.",
    )


@router.get("/{class_id}/registrations", response_model=ApiResponse, summary="Danh sách đăng ký")
async def list_registrations(
    class_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClassRegistration).where(ClassRegistration.class_id == class_id)
    )
    regs = result.scalars().all()
    return ApiResponse(data=[ClassRegistrationResponse.model_validate(r) for r in regs])


@router.post(
    "/{class_id}/registrations/{reg_id}/review",
    response_model=ApiResponse,
    summary="Staff duyệt đăng ký lớp",
)
async def review_registration(
    class_id: int,
    reg_id: int,
    body: ReviewAction,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.action not in ("APPROVED", "REJECTED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Action phải là APPROVED hoặc REJECTED.")

    result = await db.execute(
        select(ClassRegistration).where(
            ClassRegistration.id == reg_id, ClassRegistration.class_id == class_id
        )
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đăng ký.")
    if reg.status != "PENDING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đăng ký không ở trạng thái PENDING.")

    class_result = await db.execute(select(CourseClass).where(CourseClass.id == class_id))
    cc = class_result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lớp nhóm.")

    if body.action == "APPROVED":
        if not cc.primary_tutor_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể duyệt đăng ký khi lớp chưa có gia sư.")
        count_result = await db.execute(
            select(func.count()).where(
                ClassRegistration.class_id == class_id,
                ClassRegistration.id != reg.id,
                ClassRegistration.status.in_(("PENDING", "APPROVED", "PAID")),
            )
        )
        current_count = count_result.scalar() or 0
        if current_count >= cc.max_students:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lớp đã đủ số lượng học viên.")

        # Get or create TeachingContract for class tutor
        contract_id = None
        if cc.primary_tutor_id:
            contract_res = await db.execute(
                select(TeachingContract).where(
                    TeachingContract.class_id == class_id,
                    TeachingContract.tutor_id == cc.primary_tutor_id,
                )
            )
            contract = contract_res.scalar_one_or_none()
            if contract:
                contract_id = contract.id
            else:
                from app.services.settings import get_commission_rates
                center_rate, tutor_rate = await get_commission_rates(db)
                contract = TeachingContract(
                    tutor_id=cc.primary_tutor_id,
                    class_id=class_id,
                    commission_name_snapshot="Default Commission",
                    center_rate_snapshot=center_rate,
                    tutor_rate_snapshot=tutor_rate,
                )
                db.add(contract)
                await db.flush()
                contract_id = contract.id

        # Create Payment record automatically (status CREATED)
        from app.models.payment import Payment
        payment_res = await db.execute(
            select(Payment).where(
                Payment.target_type == "CLASS_REGISTRATION",
                Payment.target_id == reg.id,
            )
        )
        payment = payment_res.scalar_one_or_none()
        if not payment:
            amount = cc.fee_per_session_per_student * cc.total_sessions
            payment = Payment(
                student_account_id=reg.student_account_id,
                target_type="CLASS_REGISTRATION",
                target_id=reg.id,
                contract_id=contract_id,
                amount=amount,
                status="CREATED",
            )
            db.add(payment)
            await enrich_payment_with_sepay(payment, db)

    reg.status = body.action
    reg.review_note = body.review_note
    reg.reviewed_by_account_id = current_user.id
    await db.commit()
    await db.refresh(reg)
    return ApiResponse(
        data=ClassRegistrationResponse.model_validate(reg),
        message=f"Đã {body.action.lower()} đăng ký.",
    )


def calculate_class_end_date(start_date: date, total_sessions: int, schedules: list) -> date:
    if not schedules or total_sessions <= 0 or not start_date:
        return start_date

    # Check if there are custom dates
    custom_dates = []
    for p in schedules:
        d = p.get("start_date") if isinstance(p, dict) else getattr(p, "start_date", None)
        if d:
            custom_dates.append(d)

    if custom_dates:
        from datetime import date as dt_date
        parsed_dates = []
        for d in custom_dates:
            if isinstance(d, str):
                from datetime import datetime
                parsed_dates.append(datetime.strptime(d[:10], "%Y-%m-%d").date())
            elif isinstance(d, dt_date):
                parsed_dates.append(d)
        if parsed_dates:
            return max(parsed_dates)

    from collections import defaultdict
    patterns_by_day = defaultdict(list)
    for p in schedules:
        day = p["day_of_week"] if isinstance(p, dict) else p.day_of_week
        start_t = p["start_time"] if isinstance(p, dict) else p.start_time
        patterns_by_day[day].append(start_t)

    for d in patterns_by_day:
        patterns_by_day[d].sort()

    from datetime import timedelta
    current_date = start_date
    session_num = 0
    last_session_date = start_date
    max_days = 365 * 2
    days_checked = 0

    while session_num < total_sessions and days_checked < max_days:
        current_weekday = current_date.weekday() + 1
        if current_weekday in patterns_by_day:
            for start_t in patterns_by_day[current_weekday]:
                if session_num >= total_sessions:
                    break
                session_num += 1
                last_session_date = current_date

        if session_num < total_sessions:
            current_date += timedelta(days=1)
        days_checked += 1

    return last_session_date


def _generate_class_sessions(
    class_id: int,
    tutor_id: int,
    patterns: list,
    start_date: date,
    total_sessions: int,
    end_date: date | None = None,
) -> list:
    from app.models.learning_session import LearningSession
    from collections import defaultdict
    from datetime import timedelta

    sessions = []
    if not patterns or total_sessions <= 0 or not start_date:
        return sessions

    # Check if this is Custom Mode
    is_custom_mode = all(p.total_sessions == 1 for p in patterns)
    if is_custom_mode:
        sorted_patterns = sorted(patterns, key=lambda x: (x.start_date, x.start_time))
        for idx, p in enumerate(sorted_patterns[:total_sessions]):
            session = LearningSession(
                class_id=class_id,
                tutor_id=tutor_id,
                session_number=idx + 1,
                session_date=p.start_date,
                start_time=p.start_time,
                end_time=p.end_time,
            )
            sessions.append(session)
        return sessions

    patterns_by_day = defaultdict(list)
    for p in patterns:
        patterns_by_day[p.day_of_week].append(p)

    for d in patterns_by_day:
        patterns_by_day[d].sort(key=lambda x: x.start_time)

    current_date = start_date
    session_num = 0
    max_days = 365 * 2
    days_checked = 0

    while session_num < total_sessions and days_checked < max_days:
        if end_date and current_date > end_date:
            break

        current_weekday = current_date.weekday() + 1
        if current_weekday in patterns_by_day:
            for p in patterns_by_day[current_weekday]:
                if session_num >= total_sessions:
                    break
                session_num += 1
                session = LearningSession(
                    class_id=class_id,
                    tutor_id=tutor_id,
                    session_number=session_num,
                    session_date=current_date,
                    start_time=p.start_time,
                    end_time=p.end_time,
                )
                sessions.append(session)

        current_date += timedelta(days=1)
        days_checked += 1

    return sessions
