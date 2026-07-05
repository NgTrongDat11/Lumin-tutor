"""Add private request link to course classes.

Revision ID: 20260609_0005
Revises: 20260609_0004
Create Date: 2026-06-09
"""

from alembic import op
import sqlalchemy as sa


revision = "20260609_0005"
down_revision = "20260609_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course_classes",
        sa.Column("private_request_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_course_classes_private_request_id",
        "course_classes",
        "private_tutoring_requests",
        ["private_request_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_course_classes_private_request_id",
        "course_classes",
        ["private_request_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_course_classes_private_request_id", "course_classes", type_="unique")
    op.drop_constraint("fk_course_classes_private_request_id", "course_classes", type_="foreignkey")
    op.drop_column("course_classes", "private_request_id")
