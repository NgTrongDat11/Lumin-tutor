"""Super admin API — staff management, admin stats, and audit log."""

import secrets
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.course_class import CourseClass
from app.models.payment import Payment
from app.models.teaching_contract import TeachingContract
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.schemas.auth import EmailStr
from app.schemas.common import ApiResponse
from app.services.audit import log_audit

router = APIRouter(prefix="/admin", tags=["Admin"])


class StaffCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    phone: str | None = None


class StaffStatusUpdate(BaseModel):
    status: str


def _staff_payload(account: UserAccount) -> dict:
    return {
        "id": account.id,
        "email": account.email,
        "full_name": account.full_name,
        "phone": account.phone,
        "avatar_url": account.avatar_url,
        "status": account.status,
        "created_at": account.created_at.isoformat() if account.created_at else None,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


@router.get("/staff", response_model=ApiResponse, summary="Danh sách tài khoản staff")
async def list_staff(
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAccount)
        .where(UserAccount.role == "STAFF")
        .order_by(UserAccount.created_at.desc())
    )
    return ApiResponse(data=[_staff_payload(account) for account in result.scalars().all()])


@router.post(
    "/staff",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo tài khoản staff",
)
async def create_staff(
    body: StaffCreateRequest,
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(UserAccount).where(UserAccount.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã tồn tại.")

    temp_password = body.password or secrets.token_urlsafe(6)
    staff = UserAccount(
        email=body.email,
        password_hash=hash_password(temp_password),
        role="STAFF",
        full_name=body.full_name,
        phone=body.phone,
        status="ACTIVE",
    )
    db.add(staff)
    await db.flush()
    log_audit(
        db,
        current_user,
        "STAFF_CREATED",
        "UserAccount",
        staff.id,
        {"email": staff.email, "full_name": staff.full_name},
    )
    await db.commit()
    await db.refresh(staff)
    return ApiResponse(
        data={"staff": _staff_payload(staff), "temp_password": temp_password},
        message="Tạo tài khoản staff thành công.",
    )


@router.patch("/staff/{staff_id}/status", response_model=ApiResponse, summary="Khóa hoặc mở khóa staff")
async def update_staff_status(
    staff_id: int,
    body: StaffStatusUpdate,
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in ("ACTIVE", "SUSPENDED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Status phải là ACTIVE hoặc SUSPENDED.")

    result = await db.execute(
        select(UserAccount).where(UserAccount.id == staff_id, UserAccount.role == "STAFF")
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản staff.")

    old_status = staff.status
    staff.status = body.status
    log_audit(
        db,
        current_user,
        "STAFF_STATUS_UPDATED",
        "UserAccount",
        staff.id,
        {"email": staff.email, "old_status": old_status, "new_status": staff.status},
    )
    await db.commit()
    await db.refresh(staff)
    action_label = "mở khóa" if staff.status == "ACTIVE" else "khóa"
    return ApiResponse(data=_staff_payload(staff), message=f"Đã {action_label} staff {staff.full_name}.")


@router.post("/staff/{staff_id}/reset-password", response_model=ApiResponse, summary="Cấp lại mật khẩu staff")
async def reset_staff_password(
    staff_id: int,
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAccount).where(UserAccount.id == staff_id, UserAccount.role == "STAFF")
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản staff.")

    temp_password = secrets.token_urlsafe(6)
    staff.password_hash = hash_password(temp_password)
    log_audit(
        db,
        current_user,
        "STAFF_PASSWORD_RESET",
        "UserAccount",
        staff.id,
        {"email": staff.email},
    )
    await db.commit()
    return ApiResponse(
        data={"temp_password": temp_password},
        message=f"Đã cấp lại mật khẩu cho {staff.full_name}.",
    )


@router.get("/stats", response_model=ApiResponse, summary="Thống kê tổng quan admin")
async def get_admin_stats(
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    role_result = await db.execute(
        select(UserAccount.role, func.count(UserAccount.id)).group_by(UserAccount.role)
    )
    users_by_role = {role: count for role, count in role_result.all()}

    class_result = await db.execute(
        select(CourseClass.status, func.count(CourseClass.id)).group_by(CourseClass.status)
    )
    classes_by_status = {class_status: count for class_status, count in class_result.all()}

    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0"))).where(Payment.status == "SUCCEEDED")
    )
    paid_revenue = revenue_result.scalar() or Decimal("0")

    pending_tutors_result = await db.execute(
        select(func.count(TutorProfile.id)).where(TutorProfile.verification_status == "PENDING_REVIEW")
    )
    payment_queue_result = await db.execute(
        select(func.count(Payment.id)).where(Payment.status.in_(("CREATED", "PENDING", "REFUND_PENDING")))
    )
    pending_contracts_result = await db.execute(
        select(func.count(TeachingContract.id)).where(TeachingContract.status == "PENDING")
    )
    audit_count_result = await db.execute(select(func.count(AuditLog.id)))

    return ApiResponse(
        data={
            "users_by_role": users_by_role,
            "total_users": sum(users_by_role.values()),
            "active_staff": await _count_staff_by_status(db, "ACTIVE"),
            "suspended_staff": await _count_staff_by_status(db, "SUSPENDED"),
            "classes_by_status": classes_by_status,
            "paid_revenue": float(paid_revenue),
            "pending_tutors": pending_tutors_result.scalar() or 0,
            "payment_queue": payment_queue_result.scalar() or 0,
            "pending_contracts": pending_contracts_result.scalar() or 0,
            "audit_log_count": audit_count_result.scalar() or 0,
        }
    )


@router.get("/audit-log", response_model=ApiResponse, summary="Nhật ký thao tác hệ thống")
async def list_audit_log(
    limit: int = 50,
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    safe_limit = min(max(limit, 1), 100)
    result = await db.execute(
        select(AuditLog, UserAccount.full_name, UserAccount.email)
        .outerjoin(UserAccount, AuditLog.actor_id == UserAccount.id)
        .order_by(AuditLog.created_at.desc())
        .limit(safe_limit)
    )
    data = []
    for log, actor_name, actor_email in result.all():
        data.append(
            {
                "id": log.id,
                "actor_id": log.actor_id,
                "actor_name": actor_name,
                "actor_email": actor_email,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "detail": log.detail or {},
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
        )
    return ApiResponse(data=data)


@router.get("/config", response_model=ApiResponse, summary="Cấu hình hệ thống")
async def get_system_config(
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    from app.core.config import settings
    from app.models.system_setting import SystemSetting

    settings_res = await db.execute(select(SystemSetting))
    settings_dict = {s.key: s.value for s in settings_res.scalars().all()}
    
    commission_rate_center = int(settings_dict.get("commission_rate_center", "30"))
    commission_rate_tutor = int(settings_dict.get("commission_rate_tutor", "70"))

    return ApiResponse(
        data={
            "app_name": settings.APP_NAME,
            "debug": settings.DEBUG,
            "jwt_algorithm": settings.JWT_ALGORITHM,
            "access_token_expire_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            "cors_origins": settings.CORS_ORIGINS,
            "llm_enabled": settings.LLM_ENABLED,
            "gemini_enabled": settings.GEMINI_ENABLED,
            "gemini_model": settings.GEMINI_MODEL,
            "payment_provider": settings.PAYMENT_PROVIDER,
            "payment_expires_minutes": settings.PAYMENT_EXPIRES_MINUTES,
            "sepay_bank_name": settings.SEPAY_BANK_NAME,
            "sepay_bank_account": settings.SEPAY_BANK_ACCOUNT,
            "sepay_account_name": settings.SEPAY_ACCOUNT_NAME,
            "commission_rate_center": commission_rate_center,
            "commission_rate_tutor": commission_rate_tutor,
        }
    )


class UpdateConfigSchema(BaseModel):
    commission_rate_center: int = Field(ge=0, le=100)
    commission_rate_tutor: int = Field(ge=0, le=100)


@router.put("/config", response_model=ApiResponse, summary="Cập nhật cấu hình")
async def update_system_config(
    body: UpdateConfigSchema,
    current_user: UserAccount = Depends(require_role("SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if body.commission_rate_center + body.commission_rate_tutor != 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tổng tỷ lệ của Trung tâm và Gia sư phải bằng 100%."
        )
    
    from app.models.system_setting import SystemSetting
    
    for key, val in [
        ("commission_rate_center", str(body.commission_rate_center)),
        ("commission_rate_tutor", str(body.commission_rate_tutor))
    ]:
        setting = await db.get(SystemSetting, key)
        if setting:
            setting.value = val
        else:
            db.add(SystemSetting(key=key, value=val))
            
    await db.commit()
    return ApiResponse(message="Cập nhật cấu hình thành công")


async def _count_staff_by_status(db: AsyncSession, account_status: str) -> int:
    result = await db.execute(
        select(func.count(UserAccount.id)).where(
            UserAccount.role == "STAFF",
            UserAccount.status == account_status,
        )
    )
    return result.scalar() or 0
