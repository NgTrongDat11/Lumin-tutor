from decimal import Decimal

import pytest
from sqlalchemy import BigInteger, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import selectinload

from app.models import Base
from app.core.config import settings
from app.models.learning_need import LearningNeed
from app.models.system_setting import SystemSetting
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.seed import demo_v2
from app.services.finance import get_finance_rows, summarize_finance
from app.services.recommendation import recommend_for_need


@compiles(BigInteger, "sqlite")
def compile_big_int_sqlite(element, compiler, **kw):
    del element, compiler, kw
    return "INTEGER"


@pytest.mark.asyncio
async def test_canonical_demo_seed_is_finance_consistent(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_ENABLED", False)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(demo_v2, "async_session_factory", session_factory)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    await demo_v2.run_seed()

    async with session_factory() as session:
        rows = await get_finance_rows(session)
        summary = summarize_finance(rows)

        seed_version = await session.scalar(
            select(SystemSetting.value).where(SystemSetting.key == "demo_seed_version")
        )
        assert seed_version == demo_v2.DEMO_SEED_VERSION

        user_addresses = (await session.execute(select(UserAccount.address))).scalars().all()
        tutor_areas = (await session.execute(select(TutorProfile.teaching_area))).scalars().all()
        assert demo_v2.VINH_LONG_TRA_VINH in user_addresses
        assert demo_v2.CAN_THO_NINH_KIEU in user_addresses
        assert not any(
            value and ("TP.HCM" in value or "Quận" in value)
            for value in [*user_addresses, *tutor_areas]
        )

        math_need = await session.scalar(
            select(LearningNeed)
            .options(selectinload(LearningNeed.schedules))
            .where(
                LearningNeed.raw_text
                == f"{demo_v2.DEMO_SEED_VERSION}:student2@lumin.local:Toán"
            )
        )
        assert math_need is not None
        assert math_need.preferred_area is None
        recommendations = await recommend_for_need(math_need, session, limit=5)
        top_tutor = recommendations["tutors"][0]
        assert top_tutor["tutor"].account.email == "tutor_math@lumin.local"
        assert any("Khu vực dạy phù hợp" in reason for reason in top_tutor["reasons"])

    assert len(rows) == 6
    assert summary.gross_amount == Decimal("9000000.00")
    assert summary.refund_amount == Decimal("400000.00")
    assert summary.net_amount == Decimal("8600000.00")
    assert summary.center_net == Decimal("3500000.00")
    assert summary.tutor_net == Decimal("5100000.00")
    assert summary.missing_snapshot_count == 0

    await engine.dispose()
