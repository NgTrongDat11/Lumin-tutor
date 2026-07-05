"""add sepay payment fields

Revision ID: 20260607_0002
Revises: 20260531_0001
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260607_0002"
down_revision: Union[str, None] = "20260531_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("transfer_content", sa.String(length=100), nullable=True))
    op.add_column("payments", sa.Column("qr_data_url", sa.Text(), nullable=True))
    op.add_column("payments", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column("payments", sa.Column("sepay_transaction_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "sepay_transaction_id")
    op.drop_column("payments", "expires_at")
    op.drop_column("payments", "qr_data_url")
    op.drop_column("payments", "transfer_content")
