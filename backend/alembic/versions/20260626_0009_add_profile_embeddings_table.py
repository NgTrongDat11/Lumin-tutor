"""Add profile embeddings table.

Revision ID: 20260626_0009
Revises: 20260625_0008
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260626_0009"
down_revision = "20260625_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_embeddings",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(length=30), nullable=False),
        sa.Column("entity_id", sa.BigInteger(), nullable=False),
        sa.Column("embedding_vector", sa.Text(), nullable=False),
        sa.Column("source_text_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("entity_type", "entity_id", name="uq_profile_embedding_entity"),
    )


def downgrade() -> None:
    op.drop_table("profile_embeddings")
