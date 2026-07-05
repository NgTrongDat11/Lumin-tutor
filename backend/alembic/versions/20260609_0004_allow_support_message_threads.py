"""allow support message threads

Revision ID: 20260609_0004
Revises: 20260608_0003
Create Date: 2026-06-09
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260609_0004"
down_revision: Union[str, None] = "20260608_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'message_threads_check'
                  AND conrelid = 'message_threads'::regclass
            ) THEN
                ALTER TABLE message_threads DROP CONSTRAINT message_threads_check;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        ALTER TABLE message_threads
        ADD CONSTRAINT message_threads_context_check
        CHECK (
            (
                private_request_id IS NULL
                AND class_id IS NULL
                AND class_registration_id IS NULL
            )
            OR (
                private_request_id IS NOT NULL
                AND class_id IS NULL
                AND class_registration_id IS NULL
            )
            OR (
                private_request_id IS NULL
                AND class_id IS NOT NULL
                AND class_registration_id IS NULL
            )
            OR (
                private_request_id IS NULL
                AND class_id IS NULL
                AND class_registration_id IS NOT NULL
            )
        )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_context_check")
    op.execute(
        """
        ALTER TABLE message_threads
        ADD CONSTRAINT message_threads_check
        CHECK (
            (
                private_request_id IS NOT NULL
                AND class_id IS NULL
                AND class_registration_id IS NULL
            )
            OR (
                private_request_id IS NULL
                AND class_id IS NOT NULL
                AND class_registration_id IS NULL
            )
            OR (
                private_request_id IS NULL
                AND class_id IS NULL
                AND class_registration_id IS NOT NULL
            )
        )
        """
    )
