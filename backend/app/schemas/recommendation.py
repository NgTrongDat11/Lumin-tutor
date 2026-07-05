"""Schemas for recommendation results and feedback events."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field

from app.schemas.course_class import CourseClassResponse
from app.schemas.tutor import TutorPublicResponse


class ScoreBreakdownItem(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0)
    points: float = Field(ge=0.0)
    status: str
    note: str


class PillarScore(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0)
    points: float = Field(ge=0.0)
    status: str
    note: str
    source: str | None = None
    is_default: bool = False


class PracticalBreakdownItem(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0)
    note: str


class ScoreAdjustment(BaseModel):
    key: str
    label: str
    points: float
    note: str


class SemanticNeighbor(BaseModel):
    id: int
    name: str
    similarity: float


class SemanticInfo(BaseModel):
    method: str
    similarity: float
    normalized_score: float
    rank: int | None = None
    candidate_count: int
    normalization_applied: bool


class ReputationBreakdownItem(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0.0, le=1.0)
    weight: float | None = None
    note: str
    source: str


class RecommendationContext(BaseModel):
    scoring_version: str = "v2.6"
    generated_at: datetime
    tutor_candidate_count: int
    class_candidate_count: int
    tutor_neighbors: list[SemanticNeighbor] = Field(default_factory=list)
    class_neighbors: list[SemanticNeighbor] = Field(default_factory=list)


class RecommendedTutor(BaseModel):
    tutor: TutorPublicResponse
    score: Decimal
    reasons: list[str]
    pillars: list[PillarScore] = Field(default_factory=list)
    practical_breakdown: list[PracticalBreakdownItem] = Field(default_factory=list)
    score_breakdown: list[ScoreBreakdownItem] = Field(default_factory=list)
    score_adjustments: list[ScoreAdjustment] = Field(default_factory=list)
    semantic: SemanticInfo | None = None
    reputation_breakdown: list[ReputationBreakdownItem] = Field(default_factory=list)


class RecommendedClass(BaseModel):
    course_class: CourseClassResponse
    score: Decimal
    reasons: list[str]
    pillars: list[PillarScore] = Field(default_factory=list)
    practical_breakdown: list[PracticalBreakdownItem] = Field(default_factory=list)
    score_breakdown: list[ScoreBreakdownItem] = Field(default_factory=list)
    score_adjustments: list[ScoreAdjustment] = Field(default_factory=list)
    semantic: SemanticInfo | None = None
    reputation_breakdown: list[ReputationBreakdownItem] = Field(default_factory=list)


class RecommendationResponse(BaseModel):
    recommended_tutors: list[RecommendedTutor] = Field(default_factory=list)
    recommended_classes: list[RecommendedClass] = Field(default_factory=list)
    context: RecommendationContext | None = None


class RecommendationEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=30)
    learning_need_id: int | None = None
    target_type: str | None = Field(default=None, max_length=30)
    target_id: int | None = Field(default=None, gt=0)
    tutor_id: int | None = Field(default=None, gt=0)
    class_id: int | None = Field(default=None, gt=0)
    score_snapshot: Decimal | None = None
    reason_snapshot: str | list[str] | None = None
