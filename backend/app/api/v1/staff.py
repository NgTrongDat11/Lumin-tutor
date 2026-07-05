"""Staff verification API — review tutors, qualifications, subjects."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db, require_role
from app.models.tutor_profile import TutorProfile
from app.models.tutor_qualification import TutorQualification
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.subject import Subject
from app.schemas.common import ApiResponse
from app.schemas.private_request import PrivateRequestResponse
from app.schemas.staff import ReviewAction, TutorProfileForStaff
from app.schemas.tutor import (
    QualificationResponse,
    TutorAvailabilityResponse,
    TutorPublicResponse,
    TutorSubjectResponse,
)
from app.services.audit import log_audit

router = APIRouter(prefix="/staff", tags=["Staff Verification"])


# ── List ALL tutors (all statuses) ───────────────────────


@router.get("/tutors/all", response_model=ApiResponse, summary="Danh sách tất cả gia sư")
async def list_all_tutors(
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
        )
    )
    profiles = result.scalars().all()
    data = []
    for p in profiles:
        data.append(
            TutorPublicResponse(
                id=p.id,
                full_name=p.account.full_name if p.account else "N/A",
                avatar_url=p.account.avatar_url if p.account else None,
                bio=p.bio,
                qualification_level=p.qualification_level,
                years_experience=p.years_experience,
                teaching_mode=p.teaching_mode,
                teaching_area=p.teaching_area,
                verification_status=p.verification_status,
                average_rating=p.average_rating,
                rating_count=p.rating_count,
                subjects=[
                    TutorSubjectResponse(
                        id=ts.id,
                        subject_id=ts.subject_id,
                        subject_name=ts.subject.name if ts.subject else None,
                        grade_level=ts.grade_level,
                        fee_per_session=ts.fee_per_session,
                        status=ts.status,
                    )
                    for ts in p.subjects
                ],
                availabilities=[
                    TutorAvailabilityResponse.model_validate(a)
                    for a in p.availabilities
                ],
            )
        )
    return ApiResponse(data=data)


# ── List ALL students ────────────────────────────────────


@router.get("/students", response_model=ApiResponse, summary="Danh sách học viên")
async def list_students(
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAccount).where(UserAccount.role == "STUDENT")
    )
    students = result.scalars().all()
    data = []
    for s in students:
        data.append({
            "id": s.id,
            "full_name": s.full_name,
            "email": s.email,
            "phone": s.phone,
            "avatar_url": s.avatar_url,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return ApiResponse(data=data)


# ── Update account status (lock / unlock) ────────────────


class AccountStatusUpdate(BaseModel):
    status: str  # "ACTIVE" | "SUSPENDED"


@router.patch("/accounts/{account_id}/status", response_model=ApiResponse, summary="Khóa / mở khóa tài khoản")
async def update_account_status(
    account_id: int,
    body: AccountStatusUpdate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in ("ACTIVE", "SUSPENDED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Status phải là ACTIVE hoặc SUSPENDED.")

    result = await db.execute(
        select(UserAccount).where(UserAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản.")

    if account.role in ("STAFF", "SUPER_ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không thể thay đổi trạng thái tài khoản staff/admin.")

    if account.id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự khóa tài khoản của chính mình.")

    old_status = account.status
    account.status = body.status
    log_audit(
        db,
        current_user,
        "ACCOUNT_STATUS_UPDATED",
        "UserAccount",
        account.id,
        {
            "email": account.email,
            "role": account.role,
            "old_status": old_status,
            "new_status": account.status,
        },
    )
    await db.commit()
    action_label = "mở khóa" if body.status == "ACTIVE" else "khóa"
    return ApiResponse(message=f"Đã {action_label} tài khoản {account.full_name}.")


# ── Reset password ───────────────────────────────────────


@router.post("/accounts/{account_id}/reset-password", response_model=ApiResponse, summary="Cấp lại mật khẩu")
async def reset_account_password(
    account_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    import secrets
    from app.core.security import hash_password

    result = await db.execute(
        select(UserAccount).where(UserAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản.")

    if account.role in ("STAFF", "SUPER_ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không thể reset mật khẩu tài khoản staff/admin.")

    # Generate a random 8-char temporary password
    temp_password = secrets.token_urlsafe(6)  # ~8 chars
    account.password_hash = hash_password(temp_password)
    log_audit(
        db,
        current_user,
        "ACCOUNT_PASSWORD_RESET",
        "UserAccount",
        account.id,
        {"email": account.email, "role": account.role},
    )
    await db.commit()

    return ApiResponse(
        data={"temp_password": temp_password},
        message=f"Đã cấp lại mật khẩu cho {account.full_name}.",
    )


# ── List pending tutors ──────────────────────────────────


@router.get("/tutors/pending", response_model=ApiResponse, summary="Danh sách gia sư chờ duyệt")
async def list_pending_tutors(
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
        )
        .where(TutorProfile.verification_status == "PENDING_REVIEW")
    )
    profiles = result.scalars().all()
    data = []
    for p in profiles:
        data.append(
            TutorPublicResponse(
                id=p.id,
                full_name=p.account.full_name if p.account else "N/A",
                avatar_url=p.account.avatar_url if p.account else None,
                bio=p.bio,
                qualification_level=p.qualification_level,
                years_experience=p.years_experience,
                teaching_mode=p.teaching_mode,
                teaching_area=p.teaching_area,
                verification_status=p.verification_status,
                average_rating=p.average_rating,
                rating_count=p.rating_count,
                subjects=[
                    TutorSubjectResponse(
                        id=ts.id,
                        subject_id=ts.subject_id,
                        subject_name=ts.subject.name if ts.subject else None,
                        grade_level=ts.grade_level,
                        fee_per_session=ts.fee_per_session,
                        status=ts.status,
                    )
                    for ts in p.subjects
                ],
                availabilities=[
                    TutorAvailabilityResponse.model_validate(a)
                    for a in p.availabilities
                ],
            )
        )
    return ApiResponse(data=data)


@router.get("/tutors/{tutor_id}", response_model=ApiResponse, summary="Chi tiết hồ sơ gia sư")
async def get_tutor_detail(
    tutor_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.qualifications),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
        )
        .where(TutorProfile.id == tutor_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ gia sư.")

    from app.schemas.tutor import TutorAvailabilityResponse

    data = {
        "profile": TutorProfileForStaff.model_validate(profile),
        "qualifications": [QualificationResponse.model_validate(q) for q in profile.qualifications],
        "subjects": [
            {
                **TutorSubjectResponse.model_validate(ts).model_dump(),
                "subject_name": ts.subject.name if ts.subject else None,
                "review_note": ts.review_note,
            }
            for ts in profile.subjects
        ],
        "availabilities": [TutorAvailabilityResponse.model_validate(a) for a in profile.availabilities],
    }
    data["profile"].full_name = profile.account.full_name if profile.account else None
    data["profile"].email = profile.account.email if profile.account else None
    data["profile"].account_status = profile.account.status if profile.account else "ACTIVE"
    return ApiResponse(data=data)


# ── List pending private requests ─────────────────────────


@router.get("/private-requests/pending", response_model=ApiResponse, summary="Danh sách yêu cầu 1-1 chờ xử lý")
async def list_pending_private_requests(
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PrivateTutoringRequest)
        .where(PrivateTutoringRequest.status == "SENT")
        .order_by(PrivateTutoringRequest.created_at.desc())
    )
    reqs = result.scalars().all()

    tutor_ids = {r.tutor_id for r in reqs}
    student_ids = {r.student_account_id for r in reqs}
    subject_ids = {r.subject_id for r in reqs}

    tutor_accounts: dict[int, str] = {}
    if tutor_ids:
        tp_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name)
            .join(UserAccount, TutorProfile.account_id == UserAccount.id)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        tutor_accounts = {row[0]: row[1] for row in tp_result.all()}

    student_accounts: dict[int, str] = {}
    if student_ids:
        st_result = await db.execute(
            select(UserAccount.id, UserAccount.full_name)
            .where(UserAccount.id.in_(student_ids))
        )
        student_accounts = {row[0]: row[1] for row in st_result.all()}

    subject_names: dict[int, str] = {}
    if subject_ids:
        sub_result = await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids))
        )
        subject_names = {row[0]: row[1] for row in sub_result.all()}

    data = []
    for r in reqs:
        resp = PrivateRequestResponse.model_validate(r)
        resp.tutor_name = tutor_accounts.get(r.tutor_id)
        resp.student_name = student_accounts.get(r.student_account_id)
        resp.subject_name = subject_names.get(r.subject_id)
        data.append(resp)

    return ApiResponse(data=data)


# ── Review qualification ─────────────────────────────────


@router.post(
    "/qualifications/{qual_id}/review",
    response_model=ApiResponse,
    summary="Duyệt chứng chỉ",
)
async def review_qualification(
    qual_id: int,
    body: ReviewAction,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.action not in ("APPROVED", "REJECTED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Action phải là APPROVED hoặc REJECTED.")

    result = await db.execute(
        select(TutorQualification).where(TutorQualification.id == qual_id)
    )
    qual = result.scalar_one_or_none()
    if not qual:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chứng chỉ.")

    qual.status = body.action
    qual.review_note = body.review_note
    qual.reviewed_by_account_id = current_user.id
    qual.reviewed_at = datetime.utcnow()
    log_audit(
        db,
        current_user,
        f"QUALIFICATION_{body.action}",
        "TutorQualification",
        qual.id,
        {"tutor_id": qual.tutor_id, "review_note": body.review_note},
    )
    await db.commit()
    return ApiResponse(message=f"Đã {body.action.lower()} chứng chỉ.")


# ── Review subject ───────────────────────────────────────


@router.post(
    "/subjects/{ts_id}/review",
    response_model=ApiResponse,
    summary="Duyệt môn dạy",
)
async def review_subject(
    ts_id: int,
    body: ReviewAction,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.action not in ("APPROVED", "REJECTED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Action phải là APPROVED hoặc REJECTED.")

    result = await db.execute(select(TutorSubject).where(TutorSubject.id == ts_id))
    ts = result.scalar_one_or_none()
    if not ts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy môn dạy.")

    ts.status = body.action
    ts.review_note = body.review_note
    ts.reviewed_by_account_id = current_user.id
    ts.reviewed_at = datetime.utcnow()
    log_audit(
        db,
        current_user,
        f"TUTOR_SUBJECT_{body.action}",
        "TutorSubject",
        ts.id,
        {"tutor_id": ts.tutor_id, "subject_id": ts.subject_id, "review_note": body.review_note},
    )
    await db.commit()
    return ApiResponse(message=f"Đã {body.action.lower()} môn dạy.")


# ── Review tutor profile (overall) ──────────────────────


@router.post(
    "/tutors/{tutor_id}/review",
    response_model=ApiResponse,
    summary="Duyệt/từ chối hồ sơ gia sư",
)
async def review_tutor(
    tutor_id: int,
    body: ReviewAction,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.action not in ("VERIFIED", "REJECTED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Action phải là VERIFIED hoặc REJECTED.")

    result = await db.execute(
        select(TutorProfile).where(TutorProfile.id == tutor_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ gia sư.")

    if body.action == "VERIFIED":
        qual_result = await db.execute(
            select(TutorQualification).where(
                TutorQualification.tutor_id == tutor_id,
                TutorQualification.status == "APPROVED",
            )
        )
        if not qual_result.scalars().first():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cần ít nhất 1 chứng chỉ đã được duyệt trước khi xác minh hồ sơ.",
            )

    if profile.verification_status != "PENDING_REVIEW":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hồ sơ không ở trạng thái chờ duyệt.")

    profile.verification_status = body.action
    log_audit(
        db,
        current_user,
        f"TUTOR_PROFILE_{body.action}",
        "TutorProfile",
        profile.id,
        {"review_note": body.review_note},
    )
    await db.commit()
    return ApiResponse(message=f"Đã {body.action.lower()} hồ sơ gia sư.")
