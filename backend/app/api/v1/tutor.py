"""Tutor profile management API — profile, qualifications, subjects, availabilities."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.tutor_availability import TutorAvailability
from app.models.tutor_profile import TutorProfile
from app.models.tutor_qualification import TutorQualification
from app.models.tutor_subject import TutorSubject
from app.models.course_class import CourseClass
from app.models.user_account import UserAccount
from app.services.location import best_location_match_level
from app.schemas.common import ApiResponse
from app.schemas.tutor import (
    AvailabilityCreate,
    QualificationCreate,
    QualificationResponse,
    TutorAvailabilityResponse,
    TutorProfileResponse,
    TutorProfileUpdate,
    TutorPublicResponse,
    TutorSubjectCreate,
    TutorSubjectResponse,
)

router = APIRouter(prefix="/tutor", tags=["Tutor Profile"])


# ── Helpers ──────────────────────────────────────────────


async def _get_tutor_profile(user: UserAccount, db: AsyncSession) -> TutorProfile:
    result = await db.execute(
        select(TutorProfile).where(TutorProfile.account_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có hồ sơ gia sư.")
    return profile


def _public_tutor_response(profile: TutorProfile, include_qualifications: bool = False) -> TutorPublicResponse:
    return TutorPublicResponse(
        id=profile.id,
        full_name=profile.account.full_name if profile.account else "N/A",
        avatar_url=profile.account.avatar_url if profile.account else None,
        bio=profile.bio,
        qualification_level=profile.qualification_level,
        years_experience=profile.years_experience,
        teaching_mode=profile.teaching_mode,
        teaching_area=profile.teaching_area,
        verification_status=profile.verification_status,
        average_rating=profile.average_rating,
        rating_count=profile.rating_count,
        subjects=[
            TutorSubjectResponse(
                id=subject.id,
                subject_id=subject.subject_id,
                subject_name=subject.subject.name if subject.subject else None,
                grade_level=subject.grade_level,
                fee_per_session=subject.fee_per_session,
                status=subject.status,
            )
            for subject in profile.subjects
            if subject.status == "APPROVED"
        ],
        availabilities=[
            TutorAvailabilityResponse.model_validate(availability)
            for availability in profile.availabilities
        ],
        qualifications=[
            QualificationResponse.model_validate(qualification)
            for qualification in profile.qualifications
            if qualification.status == "APPROVED"
        ] if include_qualifications else [],
    )


# ── Public Browse ────────────────────────────────────────

@router.get("/public/browse", response_model=ApiResponse, summary="Browse tutors publicly (no auth)")
async def public_browse_tutors(
    q: str | None = None,
    mode: str | None = None,
    subject_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint to browse verified tutors without login.
    Returns TutorPublicResponse which does NOT include phone/address."""
    from sqlalchemy import and_
    from sqlalchemy.orm import selectinload
    from app.services.search import tokenize, search_tutors

    query = (
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
        )
        .where(TutorProfile.verification_status == "VERIFIED")
    )

    if mode and mode != "ALL":
        if mode == "ONLINE":
            query = query.where(TutorProfile.teaching_mode.in_(("ONLINE", "BOTH")))
        elif mode == "OFFLINE":
            query = query.where(TutorProfile.teaching_mode.in_(("OFFLINE", "BOTH")))

    if subject_id:
        query = query.where(
            TutorProfile.subjects.any(
                and_(
                    TutorSubject.subject_id == subject_id,
                    TutorSubject.status == "APPROVED"
                )
            )
        )

    result = await db.execute(query)
    profiles = list(result.scalars().all())

    # Tokenize and filter in memory
    query_tokens = tokenize(q) if q else []

    if q is not None and q.strip() and not query_tokens:
        return ApiResponse(data=[])

    if q and query_tokens:
        profiles = search_tutors(profiles, q, query_tokens)
    else:
        # Default public sort by rating desc
        profiles.sort(key=lambda p: float(p.average_rating or 0.0), reverse=True)

    paginated_profiles = profiles[offset : offset + limit]
    data = [_public_tutor_response(profile) for profile in paginated_profiles]
    return ApiResponse(data=data)



@router.get("/public/classes", response_model=ApiResponse, summary="Browse classes publicly (no auth)")
async def public_browse_classes(
    q: str | None = None,
    mode: str | None = None,
    subject_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint to browse available group classes without login."""
    from app.schemas.course_class import CourseClassResponse as CCResp
    from app.models.subject import Subject

    query = (
        select(CourseClass)
        .join(Subject, CourseClass.subject_id == Subject.id)
        .where(
            CourseClass.private_request_id.is_(None),
            CourseClass.status.in_(("ENROLLING", "READY", "ONGOING")),
        )
    )

    if mode and mode != "ALL":
        if mode == "ONLINE":
            query = query.where(CourseClass.mode.in_(("ONLINE", "BOTH")))
        elif mode == "OFFLINE":
            query = query.where(CourseClass.mode.in_(("OFFLINE", "BOTH")))

    if subject_id:
        query = query.where(CourseClass.subject_id == subject_id)

    result = await db.execute(query)
    classes_list = list(result.scalars().all())

    # Fetch subject names
    subject_ids = {course.subject_id for course in classes_list}
    subject_info: dict[int, str] = {}
    if subject_ids:
        subject_result = await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids))
        )
        subject_info = {row[0]: row[1] for row in subject_result.all()}

    # Exact search token AND matching
    from app.services.search import tokenize, search_classes
    from datetime import datetime
    query_tokens = tokenize(q) if q else []

    if q is not None and q.strip() and not query_tokens:
        return ApiResponse(data=[])

    if q and query_tokens:
        classes_list = search_classes(classes_list, q, query_tokens, subject_info)
    else:
        classes_list.sort(key=lambda course: course.created_at or datetime.min, reverse=True)

    classes = classes_list[offset : offset + limit]

    tutor_ids = {course.primary_tutor_id for course in classes if course.primary_tutor_id}
    tutor_info: dict[int, tuple[str, str | None]] = {}
    if tutor_ids:
        tutor_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name, UserAccount.avatar_url)
            .join(UserAccount, TutorProfile.account_id == UserAccount.id)
            .where(
                TutorProfile.id.in_(tutor_ids),
                TutorProfile.verification_status == "VERIFIED",
            )
        )
        tutor_info = {row[0]: (row[1], row[2]) for row in tutor_result.all()}

    # Fetch subject names
    subject_ids = {course.subject_id for course in classes}
    subject_info: dict[int, str] = {}
    if subject_ids:
        subject_result = await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids))
        )
        subject_info = {row[0]: row[1] for row in subject_result.all()}

    data = []
    for course in classes:
        response = CCResp.model_validate(course)
        if course.primary_tutor_id and course.primary_tutor_id in tutor_info:
            response.tutor_name, response.tutor_avatar_url = tutor_info[course.primary_tutor_id]
        if course.subject_id in subject_info:
            response.subject_name = subject_info[course.subject_id]
        data.append(response)

    return ApiResponse(data=data)


@router.get("/public/{tutor_id}", response_model=ApiResponse, summary="Xem hồ sơ công khai gia sư")
async def public_get_tutor(
    tutor_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Read-only public profile for verified tutors.
    Exposes approved subjects, weekly availability, and approved qualifications only.
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
            selectinload(TutorProfile.qualifications),
        )
        .where(
            TutorProfile.id == tutor_id,
            TutorProfile.verification_status == "VERIFIED",
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ gia sư công khai.")
    return ApiResponse(data=_public_tutor_response(profile, include_qualifications=True))


@router.get("/browse", response_model=ApiResponse, summary="Browse verified tutors")
async def browse_tutors(
    q: str | None = None,
    mode: str | None = None,
    subject_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    from sqlalchemy import and_
    from sqlalchemy.orm import selectinload
    from app.services.search import tokenize, search_tutors

    query = (
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
        )
        .where(TutorProfile.verification_status == "VERIFIED")
    )

    if mode and mode != "ALL":
        if mode == "ONLINE":
            query = query.where(TutorProfile.teaching_mode.in_(("ONLINE", "BOTH")))
        elif mode == "OFFLINE":
            query = query.where(TutorProfile.teaching_mode.in_(("OFFLINE", "BOTH")))

    if subject_id:
        query = query.where(
            TutorProfile.subjects.any(
                and_(
                    TutorSubject.subject_id == subject_id,
                    TutorSubject.status == "APPROVED"
                )
            )
        )

    result = await db.execute(query)
    profiles = list(result.scalars().all())

    # Tokenize and filter in memory
    query_tokens = tokenize(q) if q else []

    if q is not None and q.strip() and not query_tokens:
        return ApiResponse(data=[])

    if q and query_tokens:
        profiles = search_tutors(profiles, q, query_tokens)
    else:
        # Default authenticated sort by location-match & rating desc
        profiles.sort(
            key=lambda profile: (
                best_location_match_level(
                    current_user.address,
                    profile.account.address if profile.account else None,
                    profile.teaching_area,
                ),
                float(profile.average_rating or 0.0),
                profile.rating_count,
            ),
            reverse=True,
        )

    paginated_profiles = profiles[offset : offset + limit]
    data = [_public_tutor_response(profile) for profile in paginated_profiles]
    return ApiResponse(data=data)


# ── Profile ──────────────────────────────────────────────


@router.get("/profile", response_model=ApiResponse, summary="Xem hồ sơ gia sư")
async def get_profile(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    return ApiResponse(data=TutorProfileResponse.model_validate(profile))


@router.put("/profile", response_model=ApiResponse, summary="Cập nhật hồ sơ gia sư")
async def update_profile(
    body: TutorProfileUpdate,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)

    # Profile edits no longer reset VERIFIED status.
    # New qualifications / subjects are reviewed individually by staff.

    await db.commit()
    await db.refresh(profile)
    return ApiResponse(
        data=TutorProfileResponse.model_validate(profile),
        message="Cập nhật hồ sơ thành công.",
    )


@router.post(
    "/profile/submit-review",
    response_model=ApiResponse,
    summary="Gửi hồ sơ để staff duyệt",
)
async def submit_for_review(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    if profile.verification_status not in ("DRAFT", "REJECTED"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Chỉ có thể gửi duyệt khi hồ sơ ở trạng thái DRAFT hoặc REJECTED.",
        )

    # BD-201: cần ít nhất 1 qualification
    quals = await db.execute(
        select(TutorQualification).where(TutorQualification.tutor_id == profile.id)
    )
    if not quals.scalars().first():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cần ít nhất 1 minh chứng/chứng chỉ trước khi gửi duyệt.",
        )

    profile.verification_status = "PENDING_REVIEW"
    await db.commit()
    await db.refresh(profile)
    return ApiResponse(
        data=TutorProfileResponse.model_validate(profile),
        message="Đã gửi hồ sơ để duyệt.",
    )


# ── Qualifications ───────────────────────────────────────


@router.get("/qualifications", response_model=ApiResponse, summary="Danh sách chứng chỉ")
async def list_qualifications(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorQualification).where(TutorQualification.tutor_id == profile.id)
    )
    quals = result.scalars().all()
    return ApiResponse(data=[QualificationResponse.model_validate(q) for q in quals])


@router.post(
    "/qualifications",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm chứng chỉ",
)
async def add_qualification(
    body: QualificationCreate,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    qual = TutorQualification(tutor_id=profile.id, **body.model_dump())
    db.add(qual)

    # New qualifications are reviewed individually by staff.
    # Profile VERIFIED status is NOT reset.

    await db.commit()
    await db.refresh(qual)
    return ApiResponse(
        data=QualificationResponse.model_validate(qual),
        message="Thêm chứng chỉ thành công.",
    )


@router.delete("/qualifications/{qual_id}", response_model=ApiResponse, summary="Xoá chứng chỉ")
async def delete_qualification(
    qual_id: int,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorQualification).where(
            TutorQualification.id == qual_id,
            TutorQualification.tutor_id == profile.id,
        )
    )
    qual = result.scalar_one_or_none()
    if not qual:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chứng chỉ.")
    await db.delete(qual)
    await db.commit()
    return ApiResponse(message="Đã xoá chứng chỉ.")


# ── Tutor Subjects ───────────────────────────────────────


@router.get("/subjects", response_model=ApiResponse, summary="Danh sách môn dạy")
async def list_tutor_subjects(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorSubject).where(TutorSubject.tutor_id == profile.id)
    )
    subjects = result.scalars().all()
    data = []
    for ts in subjects:
        resp = TutorSubjectResponse.model_validate(ts)
        if ts.subject:
            resp.subject_name = ts.subject.name
        data.append(resp)
    return ApiResponse(data=data)


@router.post(
    "/subjects",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký môn dạy",
)
async def add_tutor_subject(
    body: TutorSubjectCreate,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    ts = TutorSubject(tutor_id=profile.id, **body.model_dump())
    db.add(ts)

    await db.commit()
    await db.refresh(ts)
    resp = TutorSubjectResponse.model_validate(ts)
    return ApiResponse(data=resp, message="Đăng ký môn dạy thành công.")


@router.delete("/subjects/{ts_id}", response_model=ApiResponse, summary="Xoá môn dạy")
async def delete_tutor_subject(
    ts_id: int,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorSubject).where(
            TutorSubject.id == ts_id,
            TutorSubject.tutor_id == profile.id,
        )
    )
    ts = result.scalar_one_or_none()
    if not ts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy môn dạy.")
    await db.delete(ts)
    await db.commit()
    return ApiResponse(message="Đã xoá môn dạy.")


# ── Availabilities ───────────────────────────────────────


@router.get("/availabilities", response_model=ApiResponse, summary="Danh sách lịch rảnh")
async def list_availabilities(
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorAvailability).where(TutorAvailability.tutor_id == profile.id)
    )
    avails = result.scalars().all()
    return ApiResponse(data=[TutorAvailabilityResponse.model_validate(a) for a in avails])


@router.post(
    "/availabilities",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm lịch rảnh",
)
async def add_availability(
    body: AvailabilityCreate,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    avail = TutorAvailability(tutor_id=profile.id, **body.model_dump())
    db.add(avail)
    await db.commit()
    await db.refresh(avail)
    return ApiResponse(
        data=TutorAvailabilityResponse.model_validate(avail),
        message="Thêm lịch rảnh thành công.",
    )


@router.put("/availabilities/{avail_id}", response_model=ApiResponse, summary="Cập nhật lịch rảnh")
async def update_availability(
    avail_id: int,
    body: AvailabilityCreate,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorAvailability).where(
            TutorAvailability.id == avail_id,
            TutorAvailability.tutor_id == profile.id,
        )
    )
    avail = result.scalar_one_or_none()
    if not avail:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lịch rảnh.")

    for key, value in body.model_dump().items():
        setattr(avail, key, value)

    await db.commit()
    await db.refresh(avail)
    return ApiResponse(
        data=TutorAvailabilityResponse.model_validate(avail),
        message="Cập nhật lịch rảnh thành công.",
    )


@router.delete("/availabilities/{avail_id}", response_model=ApiResponse, summary="Xoá lịch rảnh")
async def delete_availability(
    avail_id: int,
    current_user: UserAccount = Depends(require_role("TUTOR")),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_tutor_profile(current_user, db)
    result = await db.execute(
        select(TutorAvailability).where(
            TutorAvailability.id == avail_id,
            TutorAvailability.tutor_id == profile.id,
        )
    )
    avail = result.scalar_one_or_none()
    if not avail:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lịch rảnh.")
    await db.delete(avail)
    await db.commit()
    return ApiResponse(message="Đã xoá lịch rảnh.")
