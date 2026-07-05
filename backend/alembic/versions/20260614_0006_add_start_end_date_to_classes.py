"""Add start_date and end_date to course_classes.

Revision ID: 20260614_0006
Revises: 20260609_0005
Create Date: 2026-06-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260614_0006"
down_revision = "20260609_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("course_classes", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("course_classes", sa.Column("end_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("course_classes", "end_date")
    op.drop_column("course_classes", "start_date")
