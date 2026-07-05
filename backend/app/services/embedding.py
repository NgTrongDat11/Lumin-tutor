"""Cache-aware Gemini embedding service for recommendation ranking."""

from __future__ import annotations

import hashlib
import json
import logging
import math
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.profile_embedding import ProfileEmbedding

logger = logging.getLogger(__name__)


class EmbeddingServiceError(Exception):
    """Raised when embedding cannot be produced by Gemini."""


class EmbeddingService:
    """Cache-aware embedding using Gemini text-embedding-004."""

    EMBEDDING_MODEL = "text-embedding-004"

    async def embed_text(self, text: str) -> list[float]:
        vectors = await self.embed_texts([text])
        return vectors[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        cleaned = [text.strip() for text in texts]
        if not cleaned or any(not text for text in cleaned):
            raise EmbeddingServiceError("Không có nội dung để tạo embedding.")
        if not settings.GEMINI_ENABLED:
            raise EmbeddingServiceError("Gemini embedding chưa được bật.")
        if not settings.GEMINI_API_KEY:
            raise EmbeddingServiceError("Thiếu GEMINI_API_KEY.")

        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise EmbeddingServiceError("Chưa cài đặt package google-genai.") from exc

        try:
            async with genai.Client(api_key=settings.GEMINI_API_KEY).aio as client:
                result = await client.models.embed_content(
                    model=settings.GEMINI_EMBEDDING_MODEL or self.EMBEDDING_MODEL,
                    contents=cleaned if len(cleaned) > 1 else cleaned[0],
                    config=types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY"),
                )
        except Exception as exc:
            logger.warning("Gemini embedding failed; falling back to TF-IDF.", exc_info=True)
            raise EmbeddingServiceError("Gemini embedding API đang lỗi hoặc vượt quota.") from exc

        embeddings = getattr(result, "embeddings", None) or []
        vectors = [list(getattr(item, "values", None) or []) for item in embeddings]
        if len(vectors) != len(cleaned) or any(not vector for vector in vectors):
            raise EmbeddingServiceError("Gemini embedding không trả về vector hợp lệ.")
        return vectors

    async def get_or_create_embedding(
        self,
        entity_type: str,
        entity_id: int,
        source_text: str,
        db: AsyncSession,
    ) -> list[float]:
        results = await self.get_or_create_embeddings(
            [(entity_type, entity_id, source_text)],
            db,
            raise_on_error=True,
        )
        vector = results.get((entity_type, entity_id))
        if vector is None:
            raise EmbeddingServiceError("Không tạo được embedding.")
        return vector

    async def get_or_create_embeddings(
        self,
        items: Iterable[tuple[str, int, str]],
        db: AsyncSession,
        *,
        raise_on_error: bool = False,
    ) -> dict[tuple[str, int], list[float] | None]:
        normalized = [
            (entity_type, int(entity_id), source_text.strip(), self.source_text_hash(source_text))
            for entity_type, entity_id, source_text in items
            if source_text and source_text.strip()
        ]
        results: dict[tuple[str, int], list[float] | None] = {
            (entity_type, entity_id): None for entity_type, entity_id, _text, _hash in normalized
        }
        if not normalized:
            return results

        cache_rows = await self._load_cache_rows(normalized, db)
        misses: list[tuple[str, int, str, str, ProfileEmbedding | None]] = []

        for entity_type, entity_id, source_text, source_hash in normalized:
            key = (entity_type, entity_id)
            row = cache_rows.get(key)
            if row and row.source_text_hash == source_hash:
                cached_vector = self._parse_vector(row.embedding_vector)
                if cached_vector:
                    results[key] = cached_vector
                    continue
            misses.append((entity_type, entity_id, source_text, source_hash, row))

        if not misses:
            return results

        try:
            vectors = await self.embed_texts([item[2] for item in misses])
        except EmbeddingServiceError:
            if raise_on_error:
                raise
            return results

        for (entity_type, entity_id, _source_text, source_hash, row), vector in zip(misses, vectors, strict=True):
            key = (entity_type, entity_id)
            results[key] = vector
            serialized = json.dumps(vector, ensure_ascii=False, separators=(",", ":"))
            if row:
                row.embedding_vector = serialized
                row.source_text_hash = source_hash
            else:
                db.add(
                    ProfileEmbedding(
                        entity_type=entity_type,
                        entity_id=entity_id,
                        embedding_vector=serialized,
                        source_text_hash=source_hash,
                    )
                )

        await db.flush()
        return results

    def cosine_similarity(self, vec_a: list[float], vec_b: list[float]) -> float:
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0
        dot = sum(a * b for a, b in zip(vec_a, vec_b, strict=True))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return max(0.0, min(1.0, dot / (norm_a * norm_b)))

    def source_text_hash(self, source_text: str) -> str:
        return hashlib.sha256(source_text.strip().encode("utf-8")).hexdigest()

    async def _load_cache_rows(
        self,
        items: list[tuple[str, int, str, str]],
        db: AsyncSession,
    ) -> dict[tuple[str, int], ProfileEmbedding]:
        entity_types = sorted({entity_type for entity_type, _entity_id, _text, _hash in items})
        entity_ids = sorted({entity_id for _entity_type, entity_id, _text, _hash in items})
        result = await db.execute(
            select(ProfileEmbedding).where(
                ProfileEmbedding.entity_type.in_(entity_types),
                ProfileEmbedding.entity_id.in_(entity_ids),
            )
        )
        rows = result.scalars().all()
        return {(row.entity_type, row.entity_id): row for row in rows}

    def _parse_vector(self, raw: str) -> list[float] | None:
        try:
            parsed = json.loads(raw)
        except Exception:
            return None
        if not isinstance(parsed, list):
            return None
        vector: list[float] = []
        for item in parsed:
            if not isinstance(item, (int, float)):
                return None
            vector.append(float(item))
        return vector or None
