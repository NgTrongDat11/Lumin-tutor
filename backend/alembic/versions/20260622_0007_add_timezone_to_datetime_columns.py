"""Add timezone to datetime columns.

Revision ID: 20260622_0007
Revises: 20260614_0006
Create Date: 2026-06-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260622_0007"
down_revision = "20260614_0006"
branch_labels = None
depends_on = None

# Tables that use TimestampMixin (created_at + updated_at)
_TIMESTAMP_MIXIN_TABLES = [
    "audit_logs",
    "class_registrations",
    "course_classes",
    "learning_needs",
    "learning_sessions",
    "message_threads",
    "payments",
    "private_tutoring_requests",
    "reviews",
    "schedule_blocks",
    "schedule_patterns",
    "subjects",
    "teaching_contracts",
    "tutor_applications",
    "tutor_availabilities",
    "tutor_profiles",
    "tutor_qualifications",
    "tutor_subjects",
    "user_accounts",
]


def upgrade() -> None:
    # Upgrade TimestampMixin columns on all tables
    for table in _TIMESTAMP_MIXIN_TABLES:
        op.alter_column(
            table,
            "created_at",
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
            existing_server_default=sa.text("now()"),
        )
        op.alter_column(
            table,
            "updated_at",
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
            existing_server_default=sa.text("now()"),
        )

    # Upgrade notification-specific columns
    op.alter_column(
        "notifications",
        "created_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "notifications",
        "read_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Revert notification-specific columns
    op.alter_column(
        "notifications",
        "read_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=True,
    )
    op.alter_column(
        "notifications",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )

    # Revert TimestampMixin columns on all tables
    for table in _TIMESTAMP_MIXIN_TABLES:
        op.alter_column(
            table,
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=False,
            existing_server_default=sa.text("now()"),
        )
        op.alter_column(
            table,
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=False,
            existing_server_default=sa.text("now()"),
        )
