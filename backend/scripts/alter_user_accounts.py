import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

# Ensure we can load env from the parent/root backend directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("DATABASE_URL not found in environment")
    sys.exit(1)

# Ensure asyncpg driver is used
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(db_url)

async def main():
    async with engine.begin() as conn:
        print("Adding columns to user_accounts table if they do not exist...")
        await conn.execute(text(
            'ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS school VARCHAR(255);'
        ))
        await conn.execute(text(
            'ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS academic_level VARCHAR(100);'
        ))
        await conn.execute(text(
            'ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS learning_style TEXT;'
        ))
        await conn.execute(text(
            'ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS parent_notes TEXT;'
        ))
    print("Migration finished successfully.")

if __name__ == '__main__':
    asyncio.run(main())
