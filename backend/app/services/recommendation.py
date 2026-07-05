"""Recommendation service with two-tier candidate generation and normalized ranking.

Tier 1 keeps only viable tutors/classes by business constraints. Tier 2 computes
0-1 feature signals and ranks each candidate on a 100-point scale.
"""

from collections import Counter
from decimal import Decimal
from datetime import datetime, timezone
import logging
import math
import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.review import Review
from app.models.schedule_block import ScheduleBlock
from app.models.tutor_profile import TutorProfile
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount
from app.services.embedding import EmbeddingService
from app.services.location import best_location_match_level


SCORING_VERSION = "v2.6"
RECOMMENDATION_POLICY_VERSION = 2


# ── V2.5 "3 câu hỏi" pillar weights ──
PILLAR_WEIGHTS = {
    "ai": 35.0,
    "practical": 55.0,
    "reputation": 10.0,
}

TUTOR_PRACTICAL_WEIGHTS = {
    "schedule": 30.0,
    "area": 30.0,
    "fee": 25.0,
    "grade": 15.0,
}

CLASS_PRACTICAL_WEIGHTS = {
    "area": 35.0,
    "schedule": 30.0,
    "fee": 20.0,
    "capacity": 15.0,
}

PILLAR_LABELS = {
    "ai": "AI hiểu nhu cầu",
    "practical": "Điều kiện thực tế",
    "reputation": "Uy tín",
}

PRACTICAL_LABELS = {
    "schedule": "Lịch học",
    "area": "Khu vực",
    "fee": "Ngân sách",
    "grade": "Cấp lớp",
    "capacity": "Sĩ số",
}

# Kept for backward-compatible score_breakdown
TUTOR_FEATURE_WEIGHTS = {
    "subject": 25.0,
    "grade": 12.0,
    "schedule": 14.0,
    "mode": 10.0,
    "area": 13.0,
    "fee": 8.0,
    "rating": 5.0,
    "experience": 5.0,
    "semantic": 8.0,
}

CLASS_FEATURE_WEIGHTS = {
    "subject": 25.0,
    "grade": 12.0,
    "schedule": 10.0,
    "mode": 10.0,
    "area": 13.0,
    "fee": 10.0,
    "capacity": 8.0,
    "group_fit": 6.0,
    "semantic": 6.0,
}

TUTOR_FEATURE_WEIGHTS_V2_5 = {
    "subject": 0.0,
    "grade": 8.25,      # 55 * 15%
    "schedule": 16.5,   # 55 * 30%
    "mode": 0.0,
    "area": 16.5,       # 55 * 30%
    "fee": 13.75,       # 55 * 25%
    "rating": 7.0,      # 10 * 70%
    "experience": 3.0,  # 10 * 30%
    "semantic": 35.0,   # AI weight
}

CLASS_FEATURE_WEIGHTS_V2_5 = {
    "subject": 0.0,
    "grade": 0.0,
    "schedule": 16.5,   # 55 * 30%
    "mode": 0.0,
    "area": 19.25,      # 55 * 35%
    "fee": 11.0,        # 55 * 20%
    "capacity": 8.25,   # 55 * 15%
    "reputation": 10.0, # Reputation weight (neutral 0.5 for classes)
    "semantic": 35.0,   # AI weight
}

FEATURE_LABELS = {
    "subject": "Môn học",
    "grade": "Cấp lớp",
    "schedule": "Lịch học",
    "mode": "Hình thức",
    "area": "Khu vực",
    "fee": "Ngân sách",
    "rating": "Đánh giá",
    "experience": "Kinh nghiệm",
    "capacity": "Sĩ số",
    "group_fit": "Kiểu học",
    "reputation": "Uy tín",
    "semantic": "AI ngữ nghĩa",
}

STOP_WORDS = {
    "va", "voi", "cho", "can", "hoc", "lop", "mon", "cua", "toi", "em", "anh", "chi",
    "the", "la", "de", "thi", "dat", "them", "cac", "mot", "nhieu", "trong", "ngoai",
}
TOKEN_RE = re.compile(r"[0-9a-zA-ZÀ-ỹ]+", re.UNICODE)
logger = logging.getLogger(__name__)


def parse_grade_level(grade_str: str) -> set[int]:
    """Parse grade level string into a set of integer grade numbers (1-12)."""
    if not grade_str:
        return set()

    grade_str_clean = grade_str.lower().strip()
    grades = set()

    if "thpt" in grade_str_clean or "cấp 3" in grade_str_clean:
        grades.update({10, 11, 12})
    if "thcs" in grade_str_clean or "cấp 2" in grade_str_clean:
        grades.update({6, 7, 8, 9})
    if "tiểu học" in grade_str_clean or "cấp 1" in grade_str_clean:
        grades.update({1, 2, 3, 4, 5})

    grade_str_no_decimals = re.sub(r"\d+\.\d+", "", grade_str_clean)
    has_context = "lớp" in grade_str_clean or "cấp" in grade_str_clean or "khối" in grade_str_clean
    subjects = ["toán", "lý", "hóa", "anh", "văn", "sinh", "sử", "địa", "ngữ văn", "tiếng anh", "vật lý", "hóa học"]
    has_subject = any(sub in grade_str_clean for sub in subjects)
    has_letters = bool(re.search(r"[a-zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", grade_str_no_decimals))
    is_purely_numeric = not has_letters

    if has_context or is_purely_numeric or has_subject:
        range_match = re.search(r"(\d+)\s*-\s*(\d+)", grade_str_no_decimals)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2))
            if 1 <= start <= 12 and 1 <= end <= 12 and start <= end:
                grades.update(range(start, end + 1))
        else:
            numbers = [int(n) for n in re.findall(r"\b\d+", grade_str_no_decimals)]
            for num in numbers:
                if 1 <= num <= 12:
                    grades.add(num)

    return grades


def check_grade_level_match(grade_student: str, grade_tutor: str) -> bool:
    """Check if student's grade level matches tutor/class grade level."""
    if not grade_student or not grade_tutor:
        return False

    student_set = parse_grade_level(grade_student)
    tutor_set = parse_grade_level(grade_tutor)
    if student_set and tutor_set:
        return not student_set.isdisjoint(tutor_set)

    s_clean = grade_student.lower().strip()
    t_clean = grade_tutor.lower().strip()
    return s_clean in t_clean or t_clean in s_clean


async def recommend_for_need(
    need: LearningNeed,
    db: AsyncSession,
    limit: int = 20,
) -> dict:
    """Return {tutors: [...], classes: [...], context: ...} matching a LearningNeed."""

    student_info = await db.execute(
        select(UserAccount.address, UserAccount.academic_level)
        .where(UserAccount.id == need.student_account_id)
    )
    student_row = student_info.first()
    student_address = student_row[0] if student_row else None
    student_academic_level = student_row[1] if student_row else None

    effective_grade = need.grade_level or student_academic_level
    effective_area = need.preferred_area or student_address

    tutors, tutor_neighbors, tutor_candidate_count = await _filter_and_score_tutors(need, db, limit, effective_area)
    classes, class_neighbors, class_candidate_count = await _filter_and_score_classes(need, db, limit, effective_grade, effective_area)

    generated_at = datetime.now(timezone.utc)
    return {
        "tutors": tutors,
        "classes": classes,
        "context": {
            "scoring_version": SCORING_VERSION,
            "generated_at": generated_at,
            "tutor_candidate_count": tutor_candidate_count,
            "class_candidate_count": class_candidate_count,
            "tutor_neighbors": tutor_neighbors,
            "class_neighbors": class_neighbors,
        }
    }


async def recommend_for_discovery(
    student: UserAccount,
    db: AsyncSession,
    limit: int = 20,
    query: str | None = None,
) -> dict:
    """Return cold-start recommendations before the student creates a LearningNeed."""

    query_text = (query or "").strip()
    profile_text = _student_discovery_text(student)
    discovery_need = LearningNeed(
        student_account_id=student.id,
        subject_id=None,
        grade_level=student.academic_level,
        goal=query_text or None,
        budget_per_session_min=None,
        budget_per_session_max=None,
        preferred_mode="BOTH",
        preferred_learning_type="BOTH",
        preferred_area=student.address,
        raw_text=" ".join(part for part in [query_text, profile_text] if part),
        parser_source="DISCOVERY",
        status="ACTIVE",
    )
    discovery_need.schedules = []

    effective_grade = student.academic_level
    effective_area = student.address

    tutors, tutor_neighbors, tutor_candidate_count = await _filter_and_score_tutors(discovery_need, db, limit, effective_area)
    classes, class_neighbors, class_candidate_count = await _filter_and_score_classes(discovery_need, db, limit, effective_grade, effective_area)

    reason = (
        f"Gợi ý khởi đầu từ từ khóa \"{query_text}\" và hồ sơ học viên"
        if query_text
        else "Gợi ý khởi đầu từ dữ liệu hồ sơ hiện có"
    )
    for item in [*tutors, *classes]:
        item["reasons"] = [reason, *item["reasons"]]

    generated_at = datetime.now(timezone.utc)
    return {
        "tutors": tutors,
        "classes": classes,
        "context": {
            "scoring_version": SCORING_VERSION,
            "generated_at": generated_at,
            "tutor_candidate_count": tutor_candidate_count,
            "class_candidate_count": class_candidate_count,
            "tutor_neighbors": tutor_neighbors,
            "class_neighbors": class_neighbors,
        }
    }


async def _filter_and_score_tutors(
    need: LearningNeed,
    db: AsyncSession,
    limit: int,
    preferred_area: str | None,
) -> tuple[list[dict], list[dict], int]:
    """Generate tutor candidates first, then rank them with normalized features."""
    candidates = await _candidate_tutors(need, db)
    total_candidate_count = len(candidates)
    scored, tutor_neighbors = await _rank_tutor_candidates(need, candidates, preferred_area, db)
    return scored[:limit], tutor_neighbors, total_candidate_count



async def _candidate_tutors(need: LearningNeed, db: AsyncSession) -> list[dict]:
    query = (
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availabilities),
        )
        .where(TutorProfile.verification_status == "VERIFIED")
    )
    result = await db.execute(query)
    all_tutors = result.scalars().all()

    tutor_ids = [tutor.id for tutor in all_tutors]
    blocks_by_tutor: dict[int, list[ScheduleBlock]] = {}
    if tutor_ids:
        blocks_result = await db.execute(
            select(ScheduleBlock).where(
                ScheduleBlock.tutor_id.in_(tutor_ids),
                ScheduleBlock.status == "ACTIVE",
            )
        )
        for block in blocks_result.scalars().all():
            blocks_by_tutor.setdefault(block.tutor_id, []).append(block)

    candidates: list[dict] = []
    for tutor in all_tutors:
        approved_subjects = [ts for ts in tutor.subjects if ts.status == "APPROVED"]
        matching_subject = None
        if need.subject_id:
            matching_subject = next(
                (ts for ts in approved_subjects if ts.subject_id == need.subject_id),
                None,
            )
            if not matching_subject:
                continue
        elif approved_subjects:
            matching_subject = approved_subjects[0]

        if not _mode_matches(tutor.teaching_mode, need.preferred_mode):
            continue

        candidates.append({
            "tutor": tutor,
            "matching_subject": matching_subject,
            "active_blocks": blocks_by_tutor.get(tutor.id, []),
        })
    return candidates


async def _rank_tutor_candidates(
    need: LearningNeed,
    candidates: list[dict],
    preferred_area: str | None,
    db: AsyncSession,
) -> tuple[list[dict], list[dict]]:
    scored: list[dict] = []
    need_text = _learning_need_text(need)

    tutor_texts = {
        candidate["tutor"].id: _tutor_text(candidate["tutor"])
        for candidate in candidates
    }

    embedding_service, need_vector, tutor_vectors = await _semantic_embedding_context(
        need=need,
        need_text=need_text,
        entity_items=[
            ("TUTOR_PROFILE", tutor_id, source_text)
            for tutor_id, source_text in tutor_texts.items()
        ],
        db=db,
    )

    # Check if we should fallback to text similarity for the entire candidate set
    use_fallback = False
    if not need_vector:
        use_fallback = True
    else:
        for candidate in candidates:
            tutor_id = candidate["tutor"].id
            if tutor_vectors.get(("TUTOR_PROFILE", tutor_id)) is None:
                use_fallback = True
                break

    if use_fallback:
        need_vector = None

    # First pass: calculate raw semantic score
    for candidate in candidates:
        tutor = candidate["tutor"]
        tutor_text = tutor_texts.get(tutor.id, "")
        sem_score = _semantic_score(
            embedding_service,
            need_vector,
            tutor_vectors.get(("TUTOR_PROFILE", tutor.id)),
            need_text,
            tutor_text,
        )
        candidate["raw_semantic_score"] = sem_score
        candidate["semantic_score"] = sem_score
        candidate["semantic_source"] = (
            "gemini_embedding"
            if need_vector and tutor_vectors.get(("TUTOR_PROFILE", tutor.id))
            else "text_similarity"
        )

    # V2.5: Relative normalization for semantic scores
    normalization_applied = _normalize_semantic_scores(candidates)

    # Sort all candidates by semantic score descending to assign relative semantic rank
    candidates_by_semantic = sorted(candidates, key=lambda x: x["semantic_score"], reverse=True)
    for idx, candidate in enumerate(candidates_by_semantic):
        candidate["semantic_rank"] = idx + 1

    # Get top 3 semantic neighbors for tutors
    tutor_neighbors = []
    for candidate in candidates_by_semantic[:3]:
        t = candidate["tutor"]
        tutor_neighbors.append({
            "id": t.id,
            "name": t.account.full_name if t.account else f"Gia sư #{t.id}",
            "similarity": float(candidate["raw_semantic_score"]),
        })

    for candidate in candidates:
        tutor: TutorProfile = candidate["tutor"]
        matching_subject: TutorSubject | None = candidate["matching_subject"]
        active_blocks: list[ScheduleBlock] = candidate["active_blocks"]
        reasons: list[str] = []

        # ── Practical signals ──
        practical_features: dict[str, float] = {}

        grade_match = False
        if need.grade_level and matching_subject and matching_subject.grade_level:
            grade_match = check_grade_level_match(need.grade_level, matching_subject.grade_level)
        practical_features["grade"] = 1.0 if grade_match else (0.5 if not need.grade_level else 0.0)
        if grade_match and matching_subject:
            reasons.append(f"Cấp lớp phù hợp: {matching_subject.grade_level}")

        fee_score = _fee_score(
            matching_subject.fee_per_session if matching_subject else None,
            need.budget_per_session_min,
            need.budget_per_session_max,
        )
        practical_features["fee"] = fee_score
        if matching_subject and fee_score >= 0.95 and (need.budget_per_session_min or need.budget_per_session_max):
            reasons.append(f"Học phí {matching_subject.fee_per_session:,.0f} phù hợp ngân sách")

        area_score, area_reason = _tutor_area_score(need, tutor, preferred_area)
        practical_features["area"] = area_score
        if area_reason:
            reasons.append(area_reason)

        schedule_score = _schedule_score(getattr(need, "schedules", None), tutor.availabilities)
        practical_features["schedule"] = schedule_score
        if schedule_score > 0.0 and getattr(need, "schedules", None):
            reasons.append(f"Lịch khớp {schedule_score * 100:.0f}%")

        practical_score = sum(
            TUTOR_PRACTICAL_WEIGHTS[k] * _clamp(practical_features[k])
            for k in TUTOR_PRACTICAL_WEIGHTS
        ) / 100.0

        # ── Conflict penalty ──
        conflict_penalty = 0.0
        if getattr(need, "schedules", None) and active_blocks:
            if _check_block_conflict(need.schedules, active_blocks):
                conflict_penalty = 12.0
                reasons.append("Có trùng lịch đã khóa, cần kiểm tra trước khi gửi yêu cầu")

        # ── Reputation pillar ──
        rating_val = _as_float(tutor.average_rating)
        rating_score = _clamp(rating_val / 5.0) if rating_val > 0 else 0.5
        experience_score = _clamp((tutor.years_experience or 0) / 10.0)
        reputation_score = 0.7 * rating_score + 0.3 * experience_score

        if rating_val > 0:
            reasons.append(f"Đánh giá {tutor.average_rating}/5 ({tutor.rating_count} lượt)")
        if tutor.years_experience > 0:
            reasons.append(f"Kinh nghiệm {tutor.years_experience} năm")

        # ── AI pillar ──
        ai_score = candidate["semantic_score"]
        if ai_score >= 0.15:
            reasons.append("Mô tả hồ sơ phù hợp với nội dung bạn cần cải thiện")

        if need.subject_id:
            reasons.insert(0, "Dạy môn phù hợp")
        if need.preferred_mode and need.preferred_mode != "BOTH":
            reasons.append(f"Hình thức dạy phù hợp: {tutor.teaching_mode}")

        # ── V2.5 Score ──
        raw_score = (
            PILLAR_WEIGHTS["ai"] * _clamp(ai_score)
            + PILLAR_WEIGHTS["practical"] * _clamp(practical_score)
            + PILLAR_WEIGHTS["reputation"] * _clamp(reputation_score)
        )
        total_score = raw_score - conflict_penalty
        score_decimal = _score_decimal(total_score)

        score_adjustments = []
        if conflict_penalty > 0.0:
            score_adjustments.append({
                "key": "schedule_clash",
                "label": "Trùng lịch đã khóa",
                "points": -float(conflict_penalty),
                "note": "Gia sư bị trùng lịch đã khóa (-12 điểm)"
            })

        # ── Build V2.5 pillar output ──
        pillars = _build_pillars(ai_score, practical_score, reputation_score, need, candidate["semantic_source"], "tutor", is_reputation_default=False)
        practical_breakdown = _build_practical_breakdown(practical_features, TUTOR_PRACTICAL_WEIGHTS, need, "tutor")

        # ── Backward-compatible score_breakdown (V2.5 weights mapped into 9 flat signals) ──
        features_compat: dict[str, float] = {
            "subject": 1.0 if need.subject_id else (0.5 if matching_subject else 0.0),
            "grade": practical_features["grade"],
            "schedule": practical_features["schedule"],
            "mode": 1.0,
            "area": practical_features["area"],
            "fee": practical_features["fee"],
            "rating": rating_score,
            "experience": experience_score,
            "semantic": ai_score,
        }

        # ── Reputation breakdown for tutor ──
        reputation_breakdown = [
            {
                "key": "tutor_rating",
                "label": "Đánh giá gia sư",
                "score": float(rating_score),
                "weight": 7.0,
                "note": f"Đánh giá {tutor.average_rating}/5 từ {tutor.rating_count} lượt" if rating_val > 0 else "Chưa có lượt đánh giá",
                "source": "tutor_rating",
            },
            {
                "key": "tutor_experience",
                "label": "Kinh nghiệm giảng dạy",
                "score": float(experience_score),
                "weight": 3.0,
                "note": f"Kinh nghiệm {tutor.years_experience} năm" if tutor.years_experience > 0 else "Chưa cập nhật kinh nghiệm",
                "source": "tutor_experience",
            }
        ]

        scored.append({
            "tutor": tutor,
            "score": score_decimal,
            "reasons": reasons,
            "pillars": pillars,
            "practical_breakdown": practical_breakdown,
            "score_breakdown": _score_breakdown(
                features_compat,
                TUTOR_FEATURE_WEIGHTS_V2_5,
                target_type="tutor",
                need=need,
                semantic_source=candidate["semantic_source"],
            ),
            "score_adjustments": score_adjustments,
            "semantic": {
                "method": candidate["semantic_source"],
                "similarity": float(candidate["raw_semantic_score"]),
                "normalized_score": float(candidate["semantic_score"]),
                "rank": candidate["semantic_rank"],
                "candidate_count": len(candidates),
                "normalization_applied": normalization_applied,
            },
            "reputation_breakdown": reputation_breakdown,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored, tutor_neighbors




async def _filter_and_score_classes(
    need: LearningNeed,
    db: AsyncSession,
    limit: int,
    effective_grade: str | None,
    effective_area: str | None,
) -> tuple[list[dict], list[dict], int]:
    """Generate class candidates first, then rank them with normalized features."""
    if not effective_grade or not effective_area:
        return [], [], 0
    if need.preferred_mode == "ONLINE":
        return [], [], 0

    candidates = await _candidate_classes(need, db, effective_grade, effective_area)
    total_candidate_count = len(candidates)
    scored, class_neighbors = await _rank_class_candidates(need, candidates, effective_grade, effective_area, db)
    return scored[:limit], class_neighbors, total_candidate_count


async def _candidate_classes(
    need: LearningNeed,
    db: AsyncSession,
    effective_grade: str,
    effective_area: str,
) -> list[dict]:
    query = (
        select(CourseClass)
        .options(selectinload(CourseClass.schedules))
        .where(
            CourseClass.private_request_id.is_(None),
            CourseClass.mode == "OFFLINE",
            CourseClass.status.in_(("ENROLLING", "READY")),
        )
    )
    if need.subject_id:
        query = query.where(CourseClass.subject_id == need.subject_id)
    result = await db.execute(query)
    all_classes = result.scalars().all()

    class_ids = [cc.id for cc in all_classes]
    registration_counts: dict[int, int] = {}
    if class_ids:
        count_result = await db.execute(
            select(
                ClassRegistration.class_id,
                func.count().label("count"),
            )
            .where(
                ClassRegistration.class_id.in_(class_ids),
                ClassRegistration.status.in_(("PENDING", "APPROVED", "PAID")),
            )
            .group_by(ClassRegistration.class_id)
        )
        for class_id, count in count_result.all():
            registration_counts[class_id] = count

    candidates: list[dict] = []
    for cc in all_classes:
        if cc.mode != "OFFLINE":
            continue
        if cc.max_students <= 1:
            continue
        if cc.status not in ("ENROLLING", "READY"):
            continue
        current_count = registration_counts.get(cc.id, 0)
        if current_count >= cc.max_students:
            continue
        if not cc.location or not cc.location.strip():
            continue
        if not check_grade_level_match(effective_grade, cc.grade_level):
            continue
        area_level = best_location_match_level(effective_area, cc.location)
        if area_level == 0:
            continue
        candidates.append({
            "course_class": cc,
            "current_count": current_count,
            "area_level": area_level,
        })
    return candidates


async def _rank_class_candidates(
    need: LearningNeed,
    candidates: list[dict],
    effective_grade: str | None,
    preferred_area: str | None,
    db: AsyncSession,
) -> tuple[list[dict], list[dict]]:
    scored: list[dict] = []
    need_text = _learning_need_text(need)
    class_texts = {
        candidate["course_class"].id: _class_text(candidate["course_class"])
        for candidate in candidates
    }
    embedding_service, need_vector, class_vectors = await _semantic_embedding_context(
        need=need,
        need_text=need_text,
        entity_items=[
            ("COURSE_CLASS", class_id, source_text)
            for class_id, source_text in class_texts.items()
        ],
        db=db,
    )

    # Check if we should fallback to text similarity for the entire candidate set
    use_fallback = False
    if not need_vector:
        use_fallback = True
    else:
        for candidate in candidates:
            class_id = candidate["course_class"].id
            if class_vectors.get(("COURSE_CLASS", class_id)) is None:
                use_fallback = True
                break

    if use_fallback:
        need_vector = None

    # First pass: calculate raw semantic score
    for candidate in candidates:
        cc = candidate["course_class"]
        class_text = class_texts.get(cc.id, "")
        sem_score = _semantic_score(
            embedding_service,
            need_vector,
            class_vectors.get(("COURSE_CLASS", cc.id)),
            need_text,
            class_text,
        )
        candidate["raw_semantic_score"] = sem_score
        candidate["semantic_score"] = sem_score
        candidate["semantic_source"] = (
            "gemini_embedding"
            if need_vector and class_vectors.get(("COURSE_CLASS", cc.id))
            else "text_similarity"
        )

    # V2.5: Relative normalization for semantic scores
    normalization_applied = _normalize_semantic_scores(candidates)

    # Sort all candidates by semantic score descending to assign relative semantic rank
    candidates_by_semantic = sorted(candidates, key=lambda x: x["semantic_score"], reverse=True)
    for idx, candidate in enumerate(candidates_by_semantic):
        candidate["semantic_rank"] = idx + 1

    # Get top 3 semantic neighbors for classes
    class_neighbors = []
    for candidate in candidates_by_semantic[:3]:
        cc = candidate["course_class"]
        class_neighbors.append({
            "id": cc.id,
            "name": cc.title,
            "similarity": float(candidate["raw_semantic_score"]),
        })

    # ── PR 2: Batch query class reviews ──
    class_ids = [c["course_class"].id for c in candidates]
    reviews_by_class = {}
    if class_ids:
        review_query = (
            select(
                ClassRegistration.class_id,
                func.count(Review.id).label("review_count"),
                func.avg(Review.rating).label("avg_rating"),
            )
            .join(Review, (Review.target_id == ClassRegistration.id) & (Review.target_type == "CLASS_REGISTRATION"))
            .where(ClassRegistration.class_id.in_(class_ids))
            .group_by(ClassRegistration.class_id)
        )
        review_result = await db.execute(review_query)
        for row in review_result.all():
            reviews_by_class[row.class_id] = (row.review_count, float(row.avg_rating))

    # ── PR 2: Batch query tutor profiles for priors ──
    tutor_ids = [c["course_class"].primary_tutor_id for c in candidates if c["course_class"].primary_tutor_id is not None]
    tutor_map = {}
    if tutor_ids:
        tutors_result = await db.execute(
            select(TutorProfile)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        for t in tutors_result.scalars().all():
            tutor_map[t.id] = t

    for candidate in candidates:
        cc: CourseClass = candidate["course_class"]
        current_count: int = candidate["current_count"]
        area_level: int = candidate["area_level"]
        reasons: list[str] = []

        # ── Practical signals ──
        practical_features: dict[str, float] = {}

        area_score, area_reason = _class_area_score(need, cc, preferred_area)
        practical_features["area"] = area_score
        if area_reason:
            reasons.append(area_reason)

        schedule_score = _schedule_score(getattr(need, "schedules", None), cc.schedules)
        practical_features["schedule"] = schedule_score
        if schedule_score > 0.0 and getattr(need, "schedules", None):
            reasons.append(f"Lịch lớp khớp {schedule_score * 100:.0f}%")

        fee_val = _fee_score(
            cc.fee_per_session_per_student,
            need.budget_per_session_min,
            need.budget_per_session_max,
        )
        practical_features["fee"] = fee_val
        if fee_val >= 0.95 and (need.budget_per_session_min or need.budget_per_session_max):
            reasons.append(f"Học phí {cc.fee_per_session_per_student:,.0f}/buổi phù hợp")

        remaining = cc.max_students - current_count
        practical_features["capacity"] = _clamp(remaining / max(cc.max_students, 1))
        reasons.append(f"Còn {remaining} chỗ trống")

        practical_score = sum(
            CLASS_PRACTICAL_WEIGHTS[k] * _clamp(practical_features[k])
            for k in CLASS_PRACTICAL_WEIGHTS
        ) / 100.0

        # ── AI pillar ──
        ai_score = candidate["semantic_score"]
        if ai_score >= 0.15:
            reasons.append("Nội dung lớp gần với ghi chú nhu cầu")

        if need.subject_id and cc.subject_id == need.subject_id:
            reasons.insert(0, "Môn học phù hợp")

        grade_match = bool(effective_grade and cc.grade_level and check_grade_level_match(effective_grade, cc.grade_level))
        if grade_match:
            reasons.append(f"Cấp lớp: {cc.grade_level}")

        if need.preferred_learning_type in ("GROUP", "BOTH", None):
            reasons.append("Phù hợp hình thức học nhóm")

        # ── PR 2: Reputation pillar V2.6 ──
        review_count, class_avg_rating = reviews_by_class.get(cc.id, (0, 0.0))
        tutor = tutor_map.get(cc.primary_tutor_id) if cc.primary_tutor_id else None
        has_tutor_data = tutor and (_as_float(tutor.average_rating) > 0 or (tutor.years_experience or 0) > 0)

        if has_tutor_data and tutor:
            rating_val = _as_float(tutor.average_rating)
            rating_score = _clamp(rating_val / 5.0) if rating_val > 0 else 0.5
            experience_score = _clamp((tutor.years_experience or 0) / 10.0)
            prior = 0.7 * rating_score + 0.3 * experience_score
            tutor_note = f"Gia sư: {tutor.average_rating}/5, {tutor.years_experience} năm kinh nghiệm"
        else:
            prior = 0.5
            tutor_note = "Chưa phân công gia sư hoặc gia sư chưa cập nhật dữ liệu uy tín"

        prior_weight = 5
        if review_count > 0:
            class_reputation = (review_count * (class_avg_rating / 5.0) + prior_weight * prior) / (review_count + prior_weight)
        else:
            class_reputation = prior
        reputation_score = _clamp(class_reputation)

        if review_count > 0:
            rep_source = "class_reviews"
            rep_default = False
            if class_avg_rating >= 3.5:
                reasons.append(f"Lớp học nhóm có đánh giá tốt: {class_avg_rating:.1f}/5 ({review_count} lượt)")
        elif has_tutor_data:
            rep_source = "primary_tutor"
            rep_default = False
            if tutor and _as_float(tutor.average_rating) >= 3.5:
                reasons.append(f"Gia sư phụ trách có đánh giá tốt: {tutor.average_rating}/5")
        else:
            rep_source = "neutral_default"
            rep_default = True

        # ── V2.5/2.6 Score ──
        raw_score = (
            PILLAR_WEIGHTS["ai"] * _clamp(ai_score)
            + PILLAR_WEIGHTS["practical"] * _clamp(practical_score)
            + PILLAR_WEIGHTS["reputation"] * _clamp(reputation_score)
        )
        score_decimal = _score_decimal(raw_score)

        # ── Build V2.5/2.6 pillar output ──
        pillars = _build_pillars(
            ai_score,
            practical_score,
            reputation_score,
            need,
            candidate["semantic_source"],
            "class",
            is_reputation_default=rep_default,
            reputation_source=rep_source,
        )
        practical_breakdown = _build_practical_breakdown(practical_features, CLASS_PRACTICAL_WEIGHTS, need, "class")

        # ── Backward-compatible score_breakdown (V2.5 weights mapped into 9 flat signals) ──
        features_compat: dict[str, float] = {
            "subject": 1.0 if need.subject_id and cc.subject_id == need.subject_id else 0.5,
            "grade": 1.0 if grade_match else (0.5 if not effective_grade else 0.0),
            "schedule": practical_features["schedule"],
            "mode": 1.0,
            "area": practical_features["area"],
            "fee": practical_features["fee"],
            "capacity": practical_features["capacity"],
            "reputation": reputation_score,
            "semantic": ai_score,
        }

        # ── Reputation breakdown V2.6 for classes ──
        if rep_source == "class_reviews":
            reputation_breakdown = [
                {
                    "key": "class_reviews",
                    "label": "Đánh giá lớp học",
                    "score": float(class_avg_rating / 5.0),
                    "note": f"{class_avg_rating:.1f}/5 từ {review_count} lượt đánh giá",
                    "source": "class_reviews",
                }
            ]
            if tutor:
                reputation_breakdown.append({
                    "key": "primary_tutor",
                    "label": "Gia sư phụ trách (Prior)",
                    "score": float(prior),
                    "note": tutor_note,
                    "source": "primary_tutor",
                })
            else:
                reputation_breakdown.append({
                    "key": "neutral_prior",
                    "label": "Mức uy tín gia sư mặc định",
                    "score": 0.5,
                    "note": "Chưa phân công gia sư",
                    "source": "neutral_default",
                })
        elif rep_source == "primary_tutor":
            reputation_breakdown = [
                {
                    "key": "primary_tutor",
                    "label": "Gia sư phụ trách",
                    "score": float(prior),
                    "note": tutor_note,
                    "source": "primary_tutor",
                }
            ]
        else:
            reputation_breakdown = [
                {
                    "key": "neutral_default",
                    "label": "Chưa đủ dữ liệu",
                    "score": 0.5,
                    "note": "Áp dụng mức trung lập",
                    "source": "neutral_default",
                }
            ]

        scored.append({
            "course_class": cc,
            "score": score_decimal,
            "reasons": reasons,
            "pillars": pillars,
            "practical_breakdown": practical_breakdown,
            "score_breakdown": _score_breakdown(
                features_compat,
                CLASS_FEATURE_WEIGHTS_V2_5,
                target_type="class",
                need=need,
                semantic_source=candidate["semantic_source"],
                effective_grade=effective_grade,
            ),
            "score_adjustments": [],
            "semantic": {
                "method": candidate["semantic_source"],
                "similarity": float(candidate["raw_semantic_score"]),
                "normalized_score": float(candidate["semantic_score"]),
                "rank": candidate["semantic_rank"],
                "candidate_count": len(candidates),
                "normalization_applied": normalization_applied,
            },
            "reputation_breakdown": reputation_breakdown,
            "area_level": area_level,
        })

    scored.sort(key=lambda x: (x["area_level"], x["score"]), reverse=True)
    return scored, class_neighbors



def _mode_matches(actual: str | None, preferred: str | None) -> bool:
    if not preferred or preferred == "BOTH":
        return True
    return actual == preferred or actual == "BOTH"


def _fee_score(
    fee: Decimal | int | float | None,
    min_budget: Decimal | None,
    max_budget: Decimal | None,
) -> float:
    if fee is None:
        return 0.0
    fee_value = Decimal(str(fee))
    if fee_value <= 0:
        return 0.0

    if min_budget and max_budget:
        if min_budget <= fee_value <= max_budget:
            return 1.0
        if fee_value < min_budget:
            return 0.7
        return _clamp(float(max_budget / fee_value))
    if max_budget:
        return 1.0 if fee_value <= max_budget else _clamp(float(max_budget / fee_value))
    if min_budget:
        return 0.7 if fee_value < min_budget else 1.0
    return 0.5


def _tutor_area_score(
    need: LearningNeed,
    tutor: TutorProfile,
    preferred_area: str | None,
) -> tuple[float, str | None]:
    uses_offline_location = (
        need.preferred_mode == "OFFLINE"
        or (need.preferred_mode == "BOTH" and tutor.teaching_mode in ("OFFLINE", "BOTH"))
    )
    if not uses_offline_location:
        return 1.0, "Học trực tuyến (không yêu cầu khu vực)"

    teaching_area_level = best_location_match_level(preferred_area, tutor.teaching_area)
    account_area_level = best_location_match_level(
        preferred_area,
        tutor.account.address if tutor.account else None,
    )
    area_level = max(teaching_area_level, account_area_level)
    if area_level == 2:
        if teaching_area_level == 2 and tutor.teaching_area:
            return 1.0, f"Khu vực dạy phù hợp: {tutor.teaching_area}"
        return 1.0, "Gia sư ở cùng khu vực với bạn"
    if area_level == 1:
        return 0.5, "Cùng tỉnh/thành với bạn"
    return 0.0, None


def _class_area_score(
    need: LearningNeed,
    cc: CourseClass,
    preferred_area: str | None,
) -> tuple[float, str | None]:
    uses_offline_location = (
        need.preferred_mode == "OFFLINE"
        or (need.preferred_mode == "BOTH" and cc.mode in ("OFFLINE", "BOTH"))
    )
    if not uses_offline_location:
        return 1.0, "Học trực tuyến (không yêu cầu khu vực)"

    area_level = best_location_match_level(preferred_area, cc.location)
    if area_level == 2:
        return 1.0, f"Địa điểm học phù hợp: {cc.location}"
    if area_level == 1:
        return 0.5, "Lớp học cùng tỉnh/thành với bạn"
    return 0.0, None


def _schedule_score(need_schedules: list | None, target_schedules: list | None) -> float:
    if not need_schedules:
        return 0.5
    if not target_schedules:
        return 0.0
    return _clamp(_check_schedule_overlap(need_schedules, target_schedules))


def _weighted_score(features: dict[str, float], weights: dict[str, float]) -> float:
    return sum(weights[key] * _clamp(features.get(key, 0.0)) for key in weights)


def _score_breakdown(
    features: dict[str, float],
    weights: dict[str, float],
    *,
    target_type: str,
    need: LearningNeed,
    semantic_source: str,
    effective_grade: str | None = None,
) -> list[dict]:
    breakdown = []
    raw_total = 0.0
    for key, weight in weights.items():
        value = _clamp(features.get(key, 0.0))
        raw_total += value * weight
        breakdown.append({
            "key": key,
            "label": FEATURE_LABELS.get(key, key),
            "score": round(value, 4),
            "weight": weight,
            "points": round(value * weight, 2),
            "status": _feature_status(key, value, need, effective_grade),
            "note": _feature_note(key, value, target_type, need, semantic_source, effective_grade),
        })
    # Distribute any rounding residual so that
    # sum(item["points"] for item in breakdown) == round(raw_total, 2).
    # Target the item with the largest existing positive points value to avoid
    # producing a negative result on zero-points items.
    if breakdown:
        serialised_sum = sum(item["points"] for item in breakdown)
        residual = round(round(raw_total, 2) - serialised_sum, 2)
        if residual != 0.0:
            positive_items = [item for item in breakdown if item["points"] > 0]
            if positive_items:
                target = max(positive_items, key=lambda x: x["points"])
                target["points"] = round(target["points"] + residual, 2)
    return breakdown


def _feature_status(key: str, value: float, need: LearningNeed, effective_grade: str | None = None) -> str:
    if key == "schedule" and not getattr(need, "schedules", None):
        return "neutral"
    if key == "fee" and not (need.budget_per_session_min or need.budget_per_session_max):
        return "neutral"
    if key == "area" and need.preferred_mode == "ONLINE":
        return "neutral"
    if key == "grade" and not (need.grade_level or effective_grade):
        return "neutral"
    if key in {"rating", "experience", "capacity"} and value == 0:
        return "neutral"
    if key == "reputation":
        return "neutral"

    if value >= 0.85:
        return "strong"
    if value >= 0.4:
        return "partial"
    return "weak"


def _feature_note(
    key: str,
    value: float,
    target_type: str,
    need: LearningNeed,
    semantic_source: str,
    effective_grade: str | None = None,
) -> str:
    percent = round(value * 100)
    target_label = "gia sư" if target_type == "tutor" else "lớp học"

    if key == "subject":
        if value >= 0.85:
            return "Môn học khớp với nhu cầu đã chọn."
        return "Chưa có môn học cụ thể nên hệ thống chấm mức trung lập."

    if key == "grade":
        if value >= 0.85:
            return "Cấp lớp của kết quả khớp với cấp lớp bạn cần."
        cmp_grade = effective_grade if target_type == "class" else need.grade_level
        if not cmp_grade:
            return "Bạn chưa nhập cấp lớp nên tiêu chí này chỉ chấm trung lập."
        return "Cấp lớp chưa khớp rõ với nhu cầu."

    if key == "schedule":
        if not getattr(need, "schedules", None):
            return "Bạn chưa giới hạn lịch học nên tiêu chí này không bị trừ mạnh."
        if value > 0:
            return f"Lịch của {target_label} khớp khoảng {percent}% với lịch bạn chọn."
        return f"Chưa thấy lịch của {target_label} trùng với lịch bạn chọn."

    if key == "mode":
        return "Hình thức học/dạy đáp ứng lựa chọn của bạn."

    if key == "area":
        if need.preferred_mode == "ONLINE":
            return "Học trực tuyến nên khu vực không phải ràng buộc chính."
        if value >= 0.85:
            return "Khu vực học/dạy gần hoặc khớp với khu vực ưu tiên."
        if value > 0:
            return "Khu vực chỉ khớp ở mức tỉnh/thành, chưa sát địa chỉ hơn."
        return "Khu vực chưa khớp với lựa chọn hoặc địa chỉ hồ sơ."

    if key == "fee":
        if not (need.budget_per_session_min or need.budget_per_session_max):
            return "Bạn chưa đặt ngân sách nên hệ thống chấm trung lập."
        if value >= 0.85:
            return "Học phí nằm trong hoặc rất sát khoảng ngân sách."
        if value > 0:
            return "Học phí có thể chấp nhận nhưng chưa tối ưu với ngân sách."
        return "Học phí chưa phù hợp với ngân sách đã khai báo."

    if key == "rating":
        if value > 0:
            return f"Đánh giá hiện tại đóng góp khoảng {percent}% trọng số uy tín."
        return "Chưa có đủ dữ liệu đánh giá để cộng điểm uy tín."

    if key == "experience":
        if value > 0:
            return f"Kinh nghiệm giảng dạy đóng góp khoảng {percent}% trọng số kinh nghiệm."
        return "Chưa có dữ liệu kinh nghiệm nổi bật."

    if key == "capacity":
        if value >= 0.85:
            return "Lớp còn nhiều chỗ trống so với sĩ số tối đa."
        if value > 0:
            return "Lớp vẫn còn chỗ nhưng sức chứa không còn quá rộng."
        return "Lớp không còn nhiều chỗ trống."

    if key == "group_fit":
        if value >= 0.85:
            return "Kiểu lớp nhóm phù hợp với lựa chọn học của bạn."
        return "Bạn ưu tiên học 1-1 nên lớp nhóm chỉ được chấm một phần."

    if key == "reputation":
        return "Lớp học nhóm sử dụng mức uy tín trung lập (chưa có dữ liệu đánh giá riêng)."

    if key == "semantic":
        method = "Gemini Embedding" if semantic_source == "gemini_embedding" else "so khớp văn bản dự phòng"
        if value >= 0.15:
            return f"{method} cho thấy nội dung {target_label} gần với ghi chú/mục tiêu học."
        return f"{method} chưa tìm thấy độ gần nội dung đủ mạnh."

    return "Tiêu chí được chấm từ dữ liệu backend."


def _score_decimal(score: float) -> Decimal:
    return Decimal(str(round(_clamp(score, 0.0, 100.0), 2)))


def _as_float(value: Decimal | int | float | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    if math.isnan(value):
        return minimum
    return max(minimum, min(maximum, value))


def _learning_need_text(need: LearningNeed) -> str:
    """Build embedding text from learning-relevant fields only (no area/mode noise)."""
    return " ".join(
        part
        for part in [
            need.grade_level,
            need.goal,
            need.raw_text,
        ]
        if part
    )


def _student_discovery_text(student: UserAccount) -> str:
    return " ".join(
        part
        for part in [
            student.academic_level,
            student.school,
            student.learning_style,
            student.parent_notes,
            student.address,
        ]
        if part
    )


def _tutor_text(tutor: TutorProfile) -> str:
    """Build embedding text from teaching-relevant fields only (no area/mode noise)."""
    approved_subjects = [ts for ts in tutor.subjects if ts.status == "APPROVED"]
    subjects_info = []
    for ts in approved_subjects:
        if ts.subject:
            subjects_info.append(f"{ts.subject.name} {ts.grade_level or ''}")
    subjects_str = " ".join(subjects_info)

    return " ".join(
        part
        for part in [
            tutor.account.full_name if tutor.account else None,
            tutor.bio,
            tutor.qualification_level,
            subjects_str,
        ]
        if part
    )



def _class_text(cc: CourseClass) -> str:
    """Build embedding text from class-relevant fields only (no location/mode noise)."""
    return " ".join(
        part
        for part in [
            cc.title,
            cc.grade_level,
            cc.goal,
        ]
        if part
    )


def _normalize_semantic_scores(candidates: list[dict]) -> bool:
    """V2.5: Apply relative normalization to spread out clustered semantic scores.
    Returns True if normalization was applied, False otherwise.
    """
    if len(candidates) <= 1:
        return False
    scores = [c["semantic_score"] for c in candidates]
    min_s, max_s = min(scores), max(scores)
    if max_s - min_s < 0.05:
        return False
    for c in candidates:
        raw = c["semantic_score"]
        relative = (raw - min_s) / (max_s - min_s)
        c["semantic_score"] = 0.6 * raw + 0.4 * relative
    return True


def _build_pillars(
    ai_score: float,
    practical_score: float,
    reputation_score: float,
    need: LearningNeed,
    semantic_source: str,
    target_type: str = "tutor",
    is_reputation_default: bool = False,
    reputation_source: str = None,
) -> list[dict]:
    """Build the 3-pillar output for V2.5/2.6 response."""
    method = "Gemini Embedding" if semantic_source == "gemini_embedding" else "so khớp văn bản"
    if target_type == "class":
        practical_note = (
            "Điều kiện thực tế (khu vực, lịch lớp, học phí, sĩ số) khớp tốt." if practical_score >= 0.7
            else "Một số điều kiện thực tế của lớp chưa khớp hoàn toàn." if practical_score >= 0.4
            else "Điều kiện thực tế của lớp chưa phù hợp lắm."
        )
        if is_reputation_default:
            reputation_note = "Lớp học nhóm sử dụng mức uy tín mặc định."
        elif reputation_source == "class_reviews":
            reputation_note = (
                "Lớp học nhóm có đánh giá tốt từ học viên." if reputation_score >= 0.7
                else "Đánh giá của lớp học nhóm ở mức trung bình." if reputation_score >= 0.4
                else "Lớp học nhóm có một số phản hồi chưa tốt."
            )
        elif reputation_source == "primary_tutor":
            reputation_note = (
                "Gia sư phụ trách lớp có đánh giá và kinh nghiệm tốt." if reputation_score >= 0.7
                else "Gia sư phụ trách có đánh giá và kinh nghiệm trung bình." if reputation_score >= 0.4
                else "Gia sư phụ trách chưa có nhiều đánh giá tốt."
            )
        else:
            reputation_note = "Lớp học nhóm sử dụng mức uy tín mặc định."
    else:
        practical_note = (
            "Điều kiện thực tế (lịch, khu vực, học phí, cấp lớp) khớp tốt." if practical_score >= 0.7
            else "Một số điều kiện thực tế chưa khớp hoàn toàn." if practical_score >= 0.4
            else "Điều kiện thực tế chưa phù hợp lắm."
        )
        reputation_note = (
            "Gia sư có đánh giá và kinh nghiệm tốt." if reputation_score >= 0.7
            else "Đánh giá và kinh nghiệm ở mức trung bình." if reputation_score >= 0.4
            else "Chưa có nhiều dữ liệu đánh giá."
        )

    pillar_data = [
        (
            "ai", ai_score,
            f"{method} cho thấy nội dung phù hợp." if ai_score >= 0.15
            else f"{method} chưa tìm thấy độ gần đủ mạnh.",
        ),
        ("practical", practical_score, practical_note),
        ("reputation", reputation_score, reputation_note),
    ]

    # AI pillar
    ai_source = semantic_source
    ai_default = False

    # Practical pillar
    practical_source = "learning_need_and_candidate"
    practical_default = False

    # Reputation pillar
    if target_type == "class":
        reputation_source = "neutral_default" if is_reputation_default else "class_reviews_or_prior"
        reputation_default = is_reputation_default
    else:
        reputation_source = "tutor_rating_and_experience"
        reputation_default = False

    pillar_configs = {
        "ai": (ai_source, ai_default),
        "practical": (practical_source, practical_default),
        "reputation": (reputation_source, reputation_default),
    }

    pillars = []
    for key, score, note in pillar_data:
        weight = PILLAR_WEIGHTS[key]
        clamped = _clamp(score)
        source_val, default_val = pillar_configs[key]
        pillars.append({
            "key": key,
            "label": PILLAR_LABELS[key],
            "score": round(clamped, 4),
            "weight": weight,
            "points": round(clamped * weight, 2),
            "status": "strong" if clamped >= 0.7 else ("partial" if clamped >= 0.4 else "weak"),
            "note": note,
            "source": source_val,
            "is_default": default_val,
        })
    return pillars


def _build_practical_breakdown(
    practical_features: dict[str, float],
    practical_weights: dict[str, float],
    need: LearningNeed,
    target_type: str = "tutor",
) -> list[dict]:
    """Build the practical sub-breakdown for V2.5 response."""
    notes = {
        "schedule": (
            "Bạn chưa giới hạn lịch học." if not getattr(need, "schedules", None)
            else f"Lịch lớp khớp {practical_features.get('schedule', 0) * 100:.0f}%." if target_type == "class"
            else f"Lịch khớp {practical_features.get('schedule', 0) * 100:.0f}%."
        ),
        "area": (
            "Khu vực lớp học phù hợp." if target_type == "class" and practical_features.get("area", 0) >= 0.85
            else "Khu vực phù hợp." if practical_features.get("area", 0) >= 0.85
            else "Cùng tỉnh/thành." if practical_features.get("area", 0) > 0
            else "Khu vực chưa khớp."
        ),
        "fee": (
            "Chưa đặt ngân sách." if not (need.budget_per_session_min or need.budget_per_session_max)
            else "Học phí phù hợp." if practical_features.get("fee", 0) >= 0.85
            else "Học phí chưa tối ưu."
        ),
        "grade": (
            "Cấp lớp phù hợp." if practical_features.get("grade", 0) >= 0.85
            else "Chưa khai báo cấp lớp." if practical_features.get("grade", 0) == 0.5
            else "Cấp lớp chưa khớp."
        ),
        "capacity": (
            "Còn nhiều chỗ trống." if practical_features.get("capacity", 0) >= 0.85
            else "Còn chỗ." if practical_features.get("capacity", 0) > 0
            else "Sắp hết chỗ."
        ),
    }
    breakdown = []
    for key, weight in practical_weights.items():
        score = _clamp(practical_features.get(key, 0.0))
        breakdown.append({
            "key": key,
            "label": PRACTICAL_LABELS.get(key, key),
            "score": round(score, 4),
            "weight": weight,
            "note": notes.get(key, ""),
        })
    return breakdown


async def _semantic_embedding_context(
    *,
    need: LearningNeed,
    need_text: str,
    entity_items: list[tuple[str, int, str]],
    db: AsyncSession,
) -> tuple[EmbeddingService, list[float] | None, dict[tuple[str, int], list[float] | None]]:
    embedding_service = EmbeddingService()
    if not need_text.strip():
        return embedding_service, None, {}

    need_id = getattr(need, "id", None)
    if need_id:
        items = [("LEARNING_NEED", need_id, need_text), *entity_items]
        try:
            vectors = await embedding_service.get_or_create_embeddings(items, db)
        except Exception:
            logger.warning("Embedding cache failed; falling back to TF-IDF semantic score.", exc_info=True)
            return embedding_service, None, {}
        return embedding_service, vectors.get(("LEARNING_NEED", need_id)), vectors

    try:
        entity_vectors = await embedding_service.get_or_create_embeddings(entity_items, db)
    except Exception:
        logger.warning("Discovery embedding cache failed; falling back to TF-IDF semantic score.", exc_info=True)
        return embedding_service, None, {}

    if not any(entity_vectors.values()):
        return embedding_service, None, entity_vectors

    try:
        need_vector = await embedding_service.embed_text(need_text)
    except Exception:
        logger.warning("Discovery query embedding failed; falling back to TF-IDF semantic score.", exc_info=True)
        return embedding_service, None, entity_vectors

    return embedding_service, need_vector, entity_vectors


def _semantic_score(
    embedding_service: EmbeddingService,
    need_vector: list[float] | None,
    entity_vector: list[float] | None,
    need_text: str,
    entity_text: str,
) -> float:
    if need_vector and entity_vector:
        return embedding_service.cosine_similarity(need_vector, entity_vector)
    return _text_similarity(need_text, entity_text)


def _text_similarity(left: str, right: str) -> float:
    left_tokens = _token_counts(left)
    right_tokens = _token_counts(right)
    if not left_tokens or not right_tokens:
        return 0.0

    shared = set(left_tokens) & set(right_tokens)
    dot = sum(left_tokens[token] * right_tokens[token] for token in shared)
    left_norm = math.sqrt(sum(count * count for count in left_tokens.values()))
    right_norm = math.sqrt(sum(count * count for count in right_tokens.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return _clamp(dot / (left_norm * right_norm))


def _token_counts(text: str) -> Counter[str]:
    tokens = []
    for raw in TOKEN_RE.findall(_strip_vietnamese_accents(text.lower())):
        if len(raw) <= 1 or raw in STOP_WORDS:
            continue
        tokens.append(raw)
    return Counter(tokens)


def _strip_vietnamese_accents(value: str) -> str:
    replacements = str.maketrans(
        "àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ",
        "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd",
    )
    return value.translate(replacements)


def _check_schedule_overlap(
    need_schedules: list,
    tutor_availabilities: list,
) -> float:
    """Return a 0-1 overlap ratio between desired schedule and target availability."""
    if not need_schedules or not tutor_availabilities:
        return 0.0

    matched = 0.0
    total = len(need_schedules)

    for ns in need_schedules:
        for ta in tutor_availabilities:
            if ns.day_of_week != ta.day_of_week:
                continue

            if ns.time_slot:
                slot_ranges = {
                    "MORNING": (7, 12),
                    "AFTERNOON": (13, 17),
                    "EVENING": (18, 21),
                }
                slot_range = slot_ranges.get(ns.time_slot)
                if slot_range:
                    ta_start_h = ta.start_time.hour
                    ta_end_h = ta.end_time.hour
                    if ta_start_h <= slot_range[0] and ta_end_h >= slot_range[1]:
                        matched += 1.0
                        break
                    if ta_start_h < slot_range[1] and ta_end_h > slot_range[0]:
                        matched += 0.5
                        break

            elif ns.start_time and ns.end_time:
                if ta.start_time <= ns.start_time and ta.end_time >= ns.end_time:
                    matched += 1.0
                    break
                if ta.start_time < ns.end_time and ta.end_time > ns.start_time:
                    matched += 0.5
                    break

    return matched / total if total > 0 else 0.0


def _check_block_conflict(
    need_schedules: list,
    active_blocks: list,
) -> bool:
    """Check if any desired schedule slot conflicts with tutor's active blocks."""
    for ns in need_schedules:
        for block in active_blocks:
            if ns.day_of_week != block.day_of_week:
                continue

            if ns.time_slot:
                slot_ranges = {
                    "MORNING": (7, 12),
                    "AFTERNOON": (13, 17),
                    "EVENING": (18, 21),
                }
                slot_range = slot_ranges.get(ns.time_slot)
                if slot_range:
                    block_start_h = block.start_time.hour
                    block_end_h = block.end_time.hour
                    if block_start_h < slot_range[1] and block_end_h > slot_range[0]:
                        return True

            elif ns.start_time and ns.end_time:
                if block.start_time < ns.end_time and block.end_time > ns.start_time:
                    return True

    return False
