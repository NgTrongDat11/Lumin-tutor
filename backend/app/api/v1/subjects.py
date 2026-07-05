"""Subject catalog API — list, create, update, delete."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.subject import Subject
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse
from app.services.audit import log_audit

router = APIRouter(prefix="/subjects", tags=["Subjects"])


class SubjectCreate(BaseModel):
    name: str = Field(max_length=100)
    description: str | None = None


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    description: str | None = None
    status: str | None = None


@router.get("", response_model=ApiResponse, summary="Danh sách môn học")
async def list_subjects(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    query = select(Subject)
    if not include_inactive:
        query = query.where(Subject.status == "ACTIVE")
    query = query.order_by(Subject.name)
    
    result = await db.execute(query)
    subjects = result.scalars().all()
    data = [
        {"id": s.id, "name": s.name, "description": s.description, "status": s.status}
        for s in subjects
    ]
    return ApiResponse(data=data)


@router.post(
    "",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Staff thêm môn học",
)
async def create_subject(
    body: SubjectCreate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Subject).where(Subject.name == body.name))
    existing_subject = existing.scalar_one_or_none()
    if existing_subject and existing_subject.status == "INACTIVE":
        existing_subject.status = "ACTIVE"
        existing_subject.description = body.description
        await db.commit()
        await db.refresh(existing_subject)
        return ApiResponse(
            data={
                "id": existing_subject.id,
                "name": existing_subject.name,
                "description": existing_subject.description,
                "status": existing_subject.status,
            },
            message="Đã khôi phục môn học đã ẩn.",
        )
    if existing_subject:
        raise HTTPException(status.HTTP_409_CONFLICT, "Môn học đã tồn tại.")

    subject = Subject(name=body.name, description=body.description)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return ApiResponse(
        data={"id": subject.id, "name": subject.name, "description": subject.description},
        message="Thêm môn học thành công.",
    )


@router.put("/{subject_id}", response_model=ApiResponse, summary="Staff cập nhật môn học")
async def update_subject(
    subject_id: int,
    body: SubjectUpdate,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy môn học.")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(subject, key, value)
    await db.commit()
    return ApiResponse(message="Cập nhật môn học thành công.")


async def _count_subject_references(db: AsyncSession, subject_id: int) -> dict[str, int]:
    checks = {
        "classes": CourseClass,
        "tutor_subjects": TutorSubject,
        "learning_needs": LearningNeed,
        "private_requests": PrivateTutoringRequest,
    }
    counts: dict[str, int] = {}
    for key, model in checks.items():
        result = await db.execute(
            select(func.count()).select_from(model).where(model.subject_id == subject_id)
        )
        counts[key] = result.scalar_one()
    return counts


@router.delete("/{subject_id}", response_model=ApiResponse, summary="Staff xoá hoặc ngừng dùng môn học")
async def delete_subject(
    subject_id: int,
    current_user: UserAccount = Depends(require_role("STAFF", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy môn học.")

    reference_counts = await _count_subject_references(db, subject_id)
    total_references = sum(reference_counts.values())
    if total_references == 0:
        log_audit(
            db,
            current_user,
            "SUBJECT_HARD_DELETE",
            "Subject",
            subject.id,
            {"name": subject.name, "reference_counts": reference_counts},
        )
        await db.delete(subject)
        await db.commit()
        return ApiResponse(
            data={"mode": "HARD_DELETED", "reference_counts": reference_counts},
            message="Đã xoá hẳn môn học chưa phát sinh dữ liệu.",
        )

    subject.status = "INACTIVE"
    log_audit(
        db,
        current_user,
        "SUBJECT_SOFT_DELETE",
        "Subject",
        subject.id,
        {"name": subject.name, "reference_counts": reference_counts},
    )
    await db.commit()
    return ApiResponse(
        data={"mode": "SOFT_DELETED", "reference_counts": reference_counts},
        message="Môn học đã có dữ liệu liên quan nên chỉ ngừng dùng để giữ lịch sử.",
    )
