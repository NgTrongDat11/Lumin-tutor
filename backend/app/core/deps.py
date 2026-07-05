"""FastAPI dependencies for database sessions, auth, and role checks."""

from collections.abc import AsyncGenerator, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decode_token
from app.db.session import async_session_factory
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount

bearer_scheme = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session."""
    async with async_session_factory() as session:
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserAccount:
    """Decode JWT and return the corresponding user, or raise 401."""
    try:
        payload = decode_token(credentials.credentials)
        user_id: int = int(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn.",
        )

    result = await db.execute(
        select(UserAccount)
        .options(selectinload(UserAccount.tutor_profile).selectinload(TutorProfile.subjects))
        .where(UserAccount.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None or user.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản không tồn tại hoặc đã bị khóa.",
        )
    return user


def require_role(*allowed_roles: str) -> Callable:
    """Factory: returns a dependency that checks if the current user has one of the allowed roles."""

    async def _check(
        current_user: UserAccount = Depends(get_current_user),
    ) -> UserAccount:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập.",
            )
        return current_user

    return _check
