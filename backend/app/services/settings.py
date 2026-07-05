from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.system_setting import SystemSetting

async def get_commission_rates(db: AsyncSession) -> tuple[Decimal, Decimal]:
    """Get center and tutor commission rates from database system_settings."""
    result = await db.execute(select(SystemSetting))
    settings_dict = {s.key: s.value for s in result.scalars().all()}
    center = Decimal(settings_dict.get("commission_rate_center", "30.00"))
    tutor = Decimal(settings_dict.get("commission_rate_tutor", "70.00"))
    return center, tutor
