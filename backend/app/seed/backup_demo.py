"""Create a JSON backup before clearing the Lumin demo database."""

from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models import Base


BACKUP_DIR = Path(__file__).resolve().parents[3] / "backend" / ".backups"


def json_default(value: object) -> str:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime, time, UUID)):
        return value.isoformat()
    raise TypeError(f"Cannot serialize {type(value).__name__}")


async def create_backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    tables: dict[str, list[dict[str, object]]] = {}
    async with async_session_factory() as db:
        for table in Base.metadata.sorted_tables:
            rows = (await db.execute(select(table))).mappings().all()
            tables[table.name] = [dict(row) for row in rows]

    payload = {"format": "lumin-demo-backup-v1", "created_at": datetime.now().isoformat(), "tables": tables}
    path = BACKUP_DIR / f"demo-before-reset-{datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, default=json_default, indent=2), encoding="utf-8")
    return path


if __name__ == "__main__":
    print(asyncio.run(create_backup()))
