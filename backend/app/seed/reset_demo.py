"""Reset application tables, recreate demo v3, and verify it."""

from __future__ import annotations

import asyncio
import os

from sqlalchemy import text

from app.db.session import engine
from app.models import Base
from app.seed.backup_demo import create_backup
from app.seed.demo_v2 import run_seed
from app.seed.verify_demo import verify_demo_seed


CONFIRM_ENV = "LUMIN_RESET_DEMO_CONFIRM"
CONFIRM_VALUE = "RESET_LUMIN_DEMO"
SKIP_BACKUP_ENV = "LUMIN_RESET_DEMO_SKIP_BACKUP"


async def reset_demo() -> None:
    if os.getenv(CONFIRM_ENV) != CONFIRM_VALUE:
        raise RuntimeError(f"Refusing to reset. Set {CONFIRM_ENV}={CONFIRM_VALUE} explicitly.")
    if engine.dialect.name != "postgresql":
        raise RuntimeError("This reset command only supports PostgreSQL demo databases.")

    backup_path = None if os.getenv(SKIP_BACKUP_ENV) == "1" else await create_backup()
    table_names = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))

    await run_seed()
    await verify_demo_seed()
    if backup_path:
        print(f"Demo reset complete. Backup: {backup_path}")
    else:
        print("Demo reset complete. Backup skipped.")


if __name__ == "__main__":
    asyncio.run(reset_demo())
