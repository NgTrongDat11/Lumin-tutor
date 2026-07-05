from sqlalchemy import BigInteger, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

import pytest
import pytest_asyncio

from app.core.config import settings
from app.models import Base
from app.models.profile_embedding import ProfileEmbedding
from app.services.embedding import EmbeddingService, EmbeddingServiceError


@compiles(BigInteger, "sqlite")
def compile_big_int_sqlite(element, compiler, **kw):
    del element, compiler, kw
    return "INTEGER"


class FakeEmbeddingService(EmbeddingService):
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [
            [float(sum(ord(char) for char in text) % 1000), float(len(text))]
            for text in texts
        ]


@pytest_asyncio.fixture()
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.mark.asyncio
async def test_get_or_create_embeddings_batches_and_reuses_cache(db_session: AsyncSession):
    service = FakeEmbeddingService()
    items = [
        ("LEARNING_NEED", 10, "cần học toán lớp 9"),
        ("TUTOR_PROFILE", 20, "gia sư toán nhiều kinh nghiệm"),
    ]

    first = await service.get_or_create_embeddings(items, db_session)
    second = await service.get_or_create_embeddings(items, db_session)
    refreshed = await service.get_or_create_embeddings(
        [("TUTOR_PROFILE", 20, "gia sư vật lý nhiều kinh nghiệm")],
        db_session,
    )

    assert service.calls == [
        ["cần học toán lớp 9", "gia sư toán nhiều kinh nghiệm"],
        ["gia sư vật lý nhiều kinh nghiệm"],
    ]
    assert second == first
    assert refreshed[("TUTOR_PROFILE", 20)] != first[("TUTOR_PROFILE", 20)]
    assert await db_session.scalar(select(func.count()).select_from(ProfileEmbedding)) == 2


@pytest.mark.asyncio
async def test_get_or_create_embeddings_returns_none_when_gemini_unavailable(
    db_session: AsyncSession,
    monkeypatch,
):
    monkeypatch.setattr(settings, "GEMINI_ENABLED", False)

    service = EmbeddingService()
    result = await service.get_or_create_embeddings(
        [("TUTOR_PROFILE", 1, "gia sư toán")],
        db_session,
    )

    assert result == {("TUTOR_PROFILE", 1): None}
    assert await db_session.scalar(select(func.count()).select_from(ProfileEmbedding)) == 0

    with pytest.raises(EmbeddingServiceError):
        await service.get_or_create_embedding("TUTOR_PROFILE", 1, "gia sư toán", db_session)
