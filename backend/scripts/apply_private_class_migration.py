"""Apply the private 1-1 class DB patch without Alembic."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import engine


SQL_STATEMENTS = [
    "ALTER TABLE course_classes ADD COLUMN IF NOT EXISTS private_request_id BIGINT",
    """
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_course_classes_private_request_id'
  ) THEN
    ALTER TABLE course_classes
    ADD CONSTRAINT fk_course_classes_private_request_id
    FOREIGN KEY (private_request_id)
    REFERENCES private_tutoring_requests(id);
  END IF;
END $$
""",
    """
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'uq_course_classes_private_request_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_course_classes_private_request_id'
  ) THEN
    DROP INDEX uq_course_classes_private_request_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_course_classes_private_request_id'
  ) THEN
    ALTER TABLE course_classes
    ADD CONSTRAINT uq_course_classes_private_request_id
    UNIQUE (private_request_id);
  END IF;
END $$
""",
]


async def main() -> None:
    async with engine.begin() as conn:
        for statement in SQL_STATEMENTS:
            await conn.execute(text(statement))

        column_ready = await conn.scalar(text("""
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'course_classes'
                AND column_name = 'private_request_id'
            )
        """))
        fk_ready = await conn.scalar(text("""
            SELECT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'fk_course_classes_private_request_id'
            )
        """))
        uq_ready = await conn.scalar(text("""
            SELECT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'uq_course_classes_private_request_id'
            )
        """))

    print({
        "private_request_id_column": bool(column_ready),
        "fk_constraint": bool(fk_ready),
        "unique_constraint": bool(uq_ready),
    })


if __name__ == "__main__":
    asyncio.run(main())
