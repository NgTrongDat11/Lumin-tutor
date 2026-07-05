"""Auth API endpoints: register, login, me."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RegisterStudentRequest,
    RegisterTutorRequest,
    TokenResponse,
    TutorProfileBrief,
    UpdatePasswordRequest,
    UserResponse,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register/student",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký tài khoản học viên",
)
async def register_student(
    body: RegisterStudentRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Check duplicate email
    existing = await db.execute(
        select(UserAccount).where(UserAccount.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email đã được sử dụng.",
        )

    user = UserAccount(
        email=body.email,
        password_hash=hash_password(body.password),
        role="STUDENT",
        full_name=body.full_name,
        phone=body.phone,
        address=body.address,
        birth_year=body.birth_year,
        school=body.school,
        academic_level=body.academic_level,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token)


@router.post(
    "/register/tutor",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký tài khoản gia sư",
)
async def register_tutor(
    body: RegisterTutorRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Check duplicate email
    existing = await db.execute(
        select(UserAccount).where(UserAccount.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email đã được sử dụng.",
        )

    user = UserAccount(
        email=body.email,
        password_hash=hash_password(body.password),
        role="TUTOR",
        full_name=body.full_name,
        phone=body.phone,
        address=body.address,
        birth_year=body.birth_year,
    )
    db.add(user)
    await db.flush()  # get user.id before creating profile

    # Auto-create tutor profile in DRAFT status
    profile = TutorProfile(account_id=user.id)
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    result = await db.execute(
        select(UserAccount).where(UserAccount.email == body.email)
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng.",
        )

    if user.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa.",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token)


@router.get(
    "/me",
    response_model=MeResponse,
    summary="Lấy thông tin tài khoản hiện tại",
)
async def get_me(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    user_resp = UserResponse.model_validate(current_user)
    tutor_brief = None

    if current_user.role == "TUTOR" and current_user.tutor_profile:
        tutor_brief = TutorProfileBrief.model_validate(current_user.tutor_profile)

    return MeResponse(user=user_resp, tutor_profile=tutor_brief)


@router.post(
    "/me/password",
    response_model=dict,
    summary="Đổi mật khẩu",
)
async def update_password(
    body: UpdatePasswordRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.core.security import verify_password, hash_password
    
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không đúng.",
        )

    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    
    return {"message": "Đổi mật khẩu thành công."}


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Cập nhật thông tin cá nhân",
)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_user, key, value)
    
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)

