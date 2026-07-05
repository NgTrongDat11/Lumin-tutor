"""Helpers for recording audit events inside existing DB transactions."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user_account import UserAccount


def log_audit(
    db: AsyncSession,
    actor: UserAccount,
    action: str,
    target_type: str,
    target_id: int | None,
    detail: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail or {},
        )
    )
