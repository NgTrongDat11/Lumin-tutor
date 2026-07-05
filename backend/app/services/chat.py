"""Student chat orchestration and context building."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.learning_session import LearningSession
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.schedule_pattern import SchedulePattern
from app.models.subject import Subject
from app.models.tutor_profile import TutorProfile
from app.models.user_account import UserAccount
from app.schemas.chat import ChatMessageItem
from app.services.gemini import GeminiService, GeminiServiceError

SYSTEM_PROMPT_TEMPLATE = """Bạn là Lumin AI — trợ lý thông minh và chủ động của hệ thống Lumin, chuyên giúp sinh viên tìm gia sư và lớp học phù hợp nhất.

## Vai trò chính: TƯ VẤN & GỢI Ý
Bạn là một tư vấn viên giáo dục thông minh. Nhiệm vụ QUAN TRỌNG NHẤT là **chủ động gợi ý** gia sư và lớp học phù hợp với nhu cầu của sinh viên.

## Nhiệm vụ (theo thứ tự ưu tiên)
1. **GỢI Ý từ thuật toán**: Khi sinh viên có nhu cầu học, hãy **ưu tiên sử dụng `algorithm_recommendations`** — đây là kết quả từ thuật toán gợi ý 2 tầng đã lọc ứng viên và tính điểm phù hợp trên thang 100. Nêu rõ tên gia sư/lớp, điểm phù hợp (score), và lý do (reasons).
2. **GỢI Ý bổ sung**: Nếu sinh viên hỏi về môn chưa có trong nhu cầu, tìm trong `available_tutors` và `open_group_classes` để gợi ý.
3. **So sánh & tư vấn**: Giúp sinh viên so sánh các lựa chọn (gia sư 1-1 vs lớp nhóm, online vs offline, học phí, thời gian).
4. **Tra cứu trạng thái**: Tra cứu yêu cầu 1-1, lớp nhóm, thanh toán, lịch học khi được hỏi.
5. **Hướng dẫn quy trình**: Giải thích cách sử dụng hệ thống Lumin.

## Nguyên tắc
- Trả lời bằng tiếng Việt, thân thiện, dùng emoji phù hợp 😊
- Xưng "mình" và gọi sinh viên là "bạn"
- **LUÔN cố gắng tìm thông tin liên quan trước khi nói "không có dữ liệu"**. Duyệt qua tất cả lớp nhóm, gia sư, và môn học để tìm kết quả gần nhất.
- Khi người dùng hỏi về môn học, hãy đối chiếu với subject_aliases VÀ tìm kiếm tên gần nghĩa trong open_group_classes và available_tutors.
- Nếu không có kết quả chính xác, hãy **gợi ý các lựa chọn gần nhất** thay vì nói "không tìm thấy".
- Nếu có `algorithm_recommendations`, hãy **ưu tiên giới thiệu kết quả từ thuật toán** vì chúng đã được tính toán phù hợp nhất. Nêu rõ score và reasons.
- Nếu sinh viên có nhu cầu học (learning_needs_active) nhưng chưa gửi yêu cầu, hãy **chủ động gợi ý** gia sư/lớp phù hợp từ algorithm_recommendations.
- Khi gợi ý gia sư, nêu rõ: tên, rating (nếu có), kinh nghiệm, học phí, lịch rảnh, điểm phù hợp.
- Khi gợi ý lớp, nêu rõ: tên lớp, môn, học phí, số chỗ còn, gia sư phụ trách, điểm phù hợp.
- **Lọc lớp nhóm trực tiếp**: Lớp nhóm gợi ý phải là học trực tiếp (**OFFLINE**). Tuyệt đối KHÔNG gợi ý lớp nhóm học online hoặc both trong hội thoại. Lớp nhóm phải khớp cấp lớp của học viên và cùng tỉnh/thành/khu vực gần học viên nhất.
- Không cung cấp thông tin cá nhân nhạy cảm (email, SĐT) của người dùng khác.
- Khi hướng dẫn thao tác, mô tả rõ đường dẫn trên giao diện.

## Cách match nhu cầu (thuật toán Lumin)
Hệ thống Lumin dùng thuật toán gợi ý 2 tầng:
- Tầng 1 lọc ứng viên không phù hợp theo ràng buộc nghiệp vụ như môn học, trạng thái gia sư/lớp, hình thức học và số chỗ còn.
- Tầng 2 chuẩn hóa từng tín hiệu về thang 0-1 rồi xếp hạng trên thang 100.
Các tín hiệu chính gồm: môn học, cấp lớp, lịch rảnh, hình thức học, khu vực, ngân sách, nội dung mô tả nhu cầu, đánh giá/kinh nghiệm của gia sư hoặc số chỗ còn của lớp.
Kết quả được sắp xếp theo điểm phù hợp từ cao đến thấp.
- Nếu sinh viên chưa nêu rõ nhu cầu, hãy hỏi: muốn học môn gì, cấp độ nào, ngân sách bao nhiêu, học online hay offline

## Một số đường dẫn giao diện
- Trang chủ Khám phá: /student (xem lớp nhóm, gia sư)
- Thời khóa biểu: /student/schedule
- Việc học: /student/my-learning
- Thanh toán: /student/payments
- Đánh giá: /student/reviews

## Quy trình đăng ký
1. Sinh viên tạo nhu cầu học → hệ thống gợi ý gia sư phù hợp
2. Sinh viên gửi yêu cầu 1-1 cho gia sư hoặc đăng ký lớp nhóm
3. Gia sư xác nhận → sinh viên thanh toán → bắt đầu học

## Dữ liệu hiện tại
{context_json}
"""


async def handle_message(
    student_id: int,
    messages: list[ChatMessageItem],
    new_message: str,
    db: AsyncSession,
) -> str:
    """Build per-request student context and ask Gemini for a reply."""
    if not settings.GEMINI_ENABLED:
        raise GeminiServiceError("Gemini chưa được bật.")
    if not settings.GEMINI_API_KEY:
        raise GeminiServiceError("Thiếu GEMINI_API_KEY.")

    context_json = await build_student_context(student_id, db)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context_json=context_json)
    return await GeminiService().chat(system_prompt, messages, new_message)


async def build_student_context(student_id: int, db: AsyncSession) -> str:
    """Query current student data and serialize it into compact JSON for Gemini."""
    student = await _get_student(student_id, db)
    raw_needs = await _get_active_learning_need_objects(student_id, db)
    needs = _format_learning_needs(raw_needs)
    requests = await _get_recent_private_requests(student_id, db)
    registrations = await _get_recent_class_registrations(student_id, db)
    payments = await _get_recent_payments(student_id, db)
    sessions = await _get_upcoming_sessions(student_id, db)
    subjects = await _get_active_subjects(db)
    classes = await _get_open_group_classes(student, db)
    tutors = await _get_available_tutors(db)

    # Read pre-computed recommendation snapshots (saved when need is created/updated)
    recommendations = _read_recommendation_snapshots(raw_needs)

    context = {
        "student": _student_to_context(student),
        "learning_needs_active": needs,
        "algorithm_recommendations": recommendations,
        "private_tutoring_requests_recent": requests,
        "class_registrations_recent": registrations,
        "payments_recent": payments,
        "upcoming_sessions": sessions,
        "subjects_active": subjects,
        "subject_aliases": _subject_aliases(),
        "open_group_classes": classes,
        "available_tutors": tutors,
    }
    return json.dumps(context, ensure_ascii=False, default=_json_default, indent=2)




async def _get_student(student_id: int, db: AsyncSession) -> UserAccount | None:
    result = await db.execute(
        select(UserAccount).where(
            UserAccount.id == student_id,
            UserAccount.role == "STUDENT",
        )
    )
    return result.scalar_one_or_none()


def _student_to_context(student: UserAccount | None) -> dict[str, Any]:
    if not student:
        return {}
    return {
        "id": student.id,
        "full_name": student.full_name,
        "birth_year": student.birth_year,
        "status": student.status,
    }


async def _get_active_learning_need_objects(
    student_id: int, db: AsyncSession
) -> list[LearningNeed]:
    """Return raw LearningNeed ORM objects (used by recommendation engine)."""
    result = await db.execute(
        select(LearningNeed)
        .options(selectinload(LearningNeed.schedules), selectinload(LearningNeed.subject))
        .where(
            LearningNeed.student_account_id == student_id,
            LearningNeed.status == "ACTIVE",
        )
        .order_by(LearningNeed.created_at.desc())
        .limit(5)
    )
    return list(result.scalars().all())


def _format_learning_needs(needs: list[LearningNeed]) -> list[dict[str, Any]]:
    """Convert LearningNeed ORM objects to JSON-serializable dicts."""
    return [
        {
            "id": need.id,
            "subject_id": need.subject_id,
            "subject_name": need.subject.name if need.subject else None,
            "grade_level": need.grade_level,
            "goal": need.goal,
            "budget_per_session_min": _decimal_to_str(need.budget_per_session_min),
            "budget_per_session_max": _decimal_to_str(need.budget_per_session_max),
            "preferred_mode": need.preferred_mode,
            "preferred_learning_type": need.preferred_learning_type,
            "preferred_area": need.preferred_area,
            "status": need.status,
            "schedules": [
                {
                    "day_of_week": schedule.day_of_week,
                    "start_time": _time_to_str(schedule.start_time),
                    "end_time": _time_to_str(schedule.end_time),
                    "time_slot": schedule.time_slot,
                }
                for schedule in need.schedules
            ],
            "created_at": need.created_at,
        }
        for need in needs
    ]


def _read_recommendation_snapshots(needs: list[LearningNeed]) -> list[dict[str, Any]]:
    """Read pre-computed recommendation snapshots from DB (no algorithm runs)."""
    from app.services.recommendation import SCORING_VERSION, RECOMMENDATION_POLICY_VERSION

    results = []
    for need in needs[:3]:
        if not need.recommendation_snapshot:
            continue
        try:
            snapshot = json.loads(need.recommendation_snapshot)
            # Skip snapshot completely if not matching V2.5/V2.6 scoring or policy version
            if snapshot.get("scoring_version") != SCORING_VERSION:
                continue
            if snapshot.get("policy_version") != RECOMMENDATION_POLICY_VERSION:
                continue
            snapshot["for_need_id"] = need.id
            snapshot["subject_name"] = need.subject.name if need.subject else None
            results.append(snapshot)
        except (json.JSONDecodeError, TypeError):
            continue
    return results


async def compute_and_save_recommendation_snapshot(
    need: LearningNeed, db: AsyncSession, commit: bool = True, raise_on_error: bool = False
) -> None:
    """Run the hybrid recommendation algorithm and save results to DB.

    Call this when a learning need is created or updated.
    """
    from app.services.recommendation import recommend_for_need, SCORING_VERSION, RECOMMENDATION_POLICY_VERSION

    try:
        recs = await recommend_for_need(need, db, limit=5)
    except Exception as e:
        logger.warning("Failed to compute recommendation snapshot for need %s", need.id, exc_info=True)
        if raise_on_error:
            raise e
        return

    tutor_recs = []
    for item in recs.get("tutors", [])[:5]:
        tutor = item["tutor"]
        tutor_recs.append({
            "tutor_name": tutor.account.full_name if tutor.account else "N/A",
            "tutor_id": tutor.id,
            "score": float(item["score"]),
            "reasons": item["reasons"],
            "average_rating": _decimal_to_str(tutor.average_rating),
            "years_experience": tutor.years_experience,
            "teaching_mode": tutor.teaching_mode,
        })

    class_recs = []
    for item in recs.get("classes", [])[:5]:
        cc = item["course_class"]
        class_recs.append({
            "class_title": cc.title,
            "class_id": cc.id,
            "score": float(item["score"]),
            "reasons": item["reasons"],
            "fee_per_session": _decimal_to_str(cc.fee_per_session_per_student),
            "mode": cc.mode,
            "status": cc.status,
        })

    snapshot = {
        "recommended_tutors": tutor_recs,
        "recommended_classes": class_recs,
        "policy_version": RECOMMENDATION_POLICY_VERSION,
        "scoring_version": SCORING_VERSION,
    }
    need.recommendation_snapshot = json.dumps(
        snapshot, ensure_ascii=False, default=_json_default
    )
    need.recommendation_updated_at = datetime.now()
    if commit:
        await db.commit()
    else:
        await db.flush()


async def _get_recent_private_requests(student_id: int, db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(
        select(PrivateTutoringRequest, Subject.name)
        .join(Subject, Subject.id == PrivateTutoringRequest.subject_id)
        .where(PrivateTutoringRequest.student_account_id == student_id)
        .order_by(PrivateTutoringRequest.created_at.desc())
        .limit(10)
    )
    return [
        {
            "id": req.id,
            "subject_id": req.subject_id,
            "subject_name": subject_name,
            "grade_level": req.grade_level,
            "goal": req.goal,
            "requested_sessions": req.requested_sessions,
            "agreed_fee_per_session": _decimal_to_str(req.agreed_fee_per_session),
            "mode": req.mode,
            "status": req.status,
            "tutor_response_note": req.tutor_response_note,
            "confirmed_at": req.confirmed_at,
            "created_at": req.created_at,
        }
        for req, subject_name in result.all()
    ]


async def _get_recent_class_registrations(student_id: int, db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(
        select(ClassRegistration, CourseClass, Subject.name)
        .join(CourseClass, CourseClass.id == ClassRegistration.class_id)
        .join(Subject, Subject.id == CourseClass.subject_id)
        .where(ClassRegistration.student_account_id == student_id)
        .order_by(ClassRegistration.created_at.desc())
        .limit(10)
    )
    return [
        {
            "registration_id": reg.id,
            "registration_status": reg.status,
            "review_note": reg.review_note,
            "class": {
                "id": course_class.id,
                "title": course_class.title,
                "subject_id": course_class.subject_id,
                "subject_name": subject_name,
                "grade_level": course_class.grade_level,
                "goal": course_class.goal,
                "fee_per_session_per_student": _decimal_to_str(course_class.fee_per_session_per_student),
                "total_sessions": course_class.total_sessions,
                "mode": course_class.mode,
                "location": course_class.location,
                "status": course_class.status,
            },
            "created_at": reg.created_at,
        }
        for reg, course_class, subject_name in result.all()
    ]


async def _get_recent_payments(student_id: int, db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(
        select(Payment)
        .where(Payment.student_account_id == student_id)
        .order_by(Payment.created_at.desc())
        .limit(10)
    )
    payments = result.scalars().all()
    return [
        {
            "id": payment.id,
            "target_type": payment.target_type,
            "target_id": payment.target_id,
            "contract_id": payment.contract_id,
            "amount": _decimal_to_str(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "provider": payment.provider,
            "billing_cycle_label": payment.billing_cycle_label,
            "paid_at": payment.paid_at,
            "refund_amount": _decimal_to_str(payment.refund_amount),
            "refund_reason": payment.refund_reason,
            "created_at": payment.created_at,
        }
        for payment in payments
    ]


async def _get_upcoming_sessions(student_id: int, db: AsyncSession) -> list[dict[str, Any]]:
    private_request_ids = select(PrivateTutoringRequest.id).where(
        PrivateTutoringRequest.student_account_id == student_id
    )
    registered_class_ids = select(ClassRegistration.class_id).where(
        ClassRegistration.student_account_id == student_id
    )

    result = await db.execute(
        select(LearningSession, CourseClass.title)
        .outerjoin(CourseClass, CourseClass.id == LearningSession.class_id)
        .where(
            or_(
                LearningSession.private_request_id.in_(private_request_ids),
                LearningSession.class_id.in_(registered_class_ids),
            ),
            LearningSession.session_date >= date.today(),
            LearningSession.status == "SCHEDULED",
        )
        .order_by(LearningSession.session_date, LearningSession.start_time)
        .limit(5)
    )
    return [
        {
            "id": session.id,
            "target_type": "CLASS" if session.class_id else "PRIVATE_TUTORING_REQUEST",
            "private_request_id": session.private_request_id,
            "class_id": session.class_id,
            "class_title": class_title,
            "tutor_id": session.tutor_id,
            "session_number": session.session_number,
            "session_date": session.session_date,
            "start_time": session.start_time,
            "end_time": session.end_time,
            "status": session.status,
        }
        for session, class_title in result.all()
    ]


async def _get_active_subjects(db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(
        select(Subject)
        .where(Subject.status == "ACTIVE")
        .order_by(Subject.name)
    )
    subjects = result.scalars().all()
    return [
        {
            "id": subject.id,
            "name": subject.name,
            "description": subject.description,
        }
        for subject in subjects
    ]


async def _get_open_group_classes(student: UserAccount | None, db: AsyncSession) -> list[dict[str, Any]]:
    if not student or not student.address or not student.academic_level:
        return []

    from app.services.location import best_location_match_level
    from app.services.recommendation import check_grade_level_match

    result = await db.execute(
        select(CourseClass, Subject.name)
        .join(Subject, Subject.id == CourseClass.subject_id)
        .where(
            CourseClass.private_request_id.is_(None),
            CourseClass.status.in_(("ENROLLING", "READY")),
            CourseClass.mode == "OFFLINE",
            CourseClass.max_students > 1,
            CourseClass.location.isnot(None),
            CourseClass.location != "",
        )
        .order_by(CourseClass.created_at.desc())
    )
    rows = result.all()
    class_ids = [course_class.id for course_class, _ in rows]
    counts_by_class: dict[int, int] = {}
    schedules_by_class: dict[int, list[dict[str, Any]]] = {}
    if class_ids:
        count_result = await db.execute(
            select(ClassRegistration.class_id, func.count().label("count"))
            .where(
                ClassRegistration.class_id.in_(class_ids),
                ClassRegistration.status.in_(("PENDING", "APPROVED", "PAID")),
            )
            .group_by(ClassRegistration.class_id)
        )
        counts_by_class = {class_id: count for class_id, count in count_result.all()}

        schedule_result = await db.execute(
            select(SchedulePattern).where(SchedulePattern.class_id.in_(class_ids))
        )
        for pattern in schedule_result.scalars().all():
            schedules_by_class.setdefault(pattern.class_id, []).append(
                {
                    "day_of_week": pattern.day_of_week,
                    "start_time": _time_to_str(pattern.start_time),
                    "end_time": _time_to_str(pattern.end_time),
                }
            )

    # Get tutor names for classes
    tutor_ids = [course_class.primary_tutor_id for course_class, _ in rows if course_class.primary_tutor_id]
    tutor_names: dict[int, str] = {}
    if tutor_ids:
        tutor_result = await db.execute(
            select(TutorProfile.id, UserAccount.full_name)
            .join(UserAccount, UserAccount.id == TutorProfile.account_id)
            .where(TutorProfile.id.in_(tutor_ids))
        )
        tutor_names = {tid: name for tid, name in tutor_result.all()}

    data = []
    aliases = _subject_aliases()
    for course_class, subject_name in rows:
        current_students = counts_by_class.get(course_class.id, 0)
        # 1. Check if class is full
        if current_students >= course_class.max_students:
            continue

        # 2. Check grade match
        if not check_grade_level_match(student.academic_level, course_class.grade_level):
            continue

        # 3. Check location match level >= 1
        area_level = best_location_match_level(student.address, course_class.location)
        if area_level == 0:
            continue

        search_keywords = [
            course_class.title,
            subject_name,
            course_class.grade_level,
            *(aliases.get(subject_name, [])),
        ]
        data.append(
            {
                "id": course_class.id,
                "title": course_class.title,
                "subject_id": course_class.subject_id,
                "subject_name": subject_name,
                "search_keywords": [keyword for keyword in search_keywords if keyword],
                "grade_level": course_class.grade_level,
                "goal": course_class.goal,
                "fee_per_session_per_student": _decimal_to_str(course_class.fee_per_session_per_student),
                "total_sessions": course_class.total_sessions,
                "min_students": course_class.min_students,
                "max_students": course_class.max_students,
                "current_students": current_students,
                "remaining_slots": max(course_class.max_students - current_students, 0),
                "mode": course_class.mode,
                "location": course_class.location,
                "status": course_class.status,
                "tutor_name": tutor_names.get(course_class.primary_tutor_id) if course_class.primary_tutor_id else None,
                "schedule": schedules_by_class.get(course_class.id, []),
                "area_level": area_level,
                "created_at": course_class.created_at,
            }
        )

    # Sort: level 2 matches (same ward) first, then level 1 matches (same province).
    # Within the same match level, sort by creation date descending.
    data.sort(key=lambda x: (x["area_level"], x["created_at"].timestamp() if getattr(x.get("created_at"), "timestamp", None) else 0), reverse=True)

    # Clean temporary sorting fields from output context
    for d in data:
        d.pop("area_level", None)
        d.pop("created_at", None)

    return data[:15]


async def _get_available_tutors(db: AsyncSession) -> list[dict[str, Any]]:
    """Get verified tutors with their subjects, ratings, and availability."""
    result = await db.execute(
        select(TutorProfile)
        .options(
            selectinload(TutorProfile.account),
            selectinload(TutorProfile.subjects),
            selectinload(TutorProfile.availabilities),
        )
        .where(TutorProfile.verification_status == "VERIFIED")
        .order_by(TutorProfile.average_rating.desc())
        .limit(20)
    )
    tutors = result.scalars().all()

    # Load subject names
    subject_ids = set()
    for tutor in tutors:
        for ts in tutor.subjects:
            if ts.status == "APPROVED":
                subject_ids.add(ts.subject_id)
    subject_names: dict[int, str] = {}
    if subject_ids:
        subj_result = await db.execute(
            select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids))
        )
        subject_names = {sid: name for sid, name in subj_result.all()}

    day_names = ["", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]

    data = []
    for tutor in tutors:
        approved_subjects = [
            {
                "subject_name": subject_names.get(ts.subject_id, f"ID:{ts.subject_id}"),
                "grade_level": ts.grade_level,
                "fee_per_session": _decimal_to_str(ts.fee_per_session),
            }
            for ts in tutor.subjects
            if ts.status == "APPROVED"
        ]
        if not approved_subjects:
            continue

        availability = [
            {
                "day": day_names[avail.day_of_week] if 1 <= avail.day_of_week <= 7 else str(avail.day_of_week),
                "time": f"{_time_to_str(avail.start_time)}-{_time_to_str(avail.end_time)}",
                "mode": avail.mode,
            }
            for avail in tutor.availabilities
        ]

        data.append(
            {
                "tutor_id": tutor.id,
                "name": tutor.account.full_name if tutor.account else "N/A",
                "bio": tutor.bio,
                "years_experience": tutor.years_experience,
                "qualification_level": tutor.qualification_level,
                "teaching_mode": tutor.teaching_mode,
                "teaching_area": tutor.teaching_area,
                "average_rating": _decimal_to_str(tutor.average_rating),
                "rating_count": tutor.rating_count,
                "subjects": approved_subjects,
                "availability": availability,
            }
        )
    return data


def _decimal_to_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def _time_to_str(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value else None


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _subject_aliases() -> dict[str, list[str]]:
    return {
        "Tiếng Anh": ["anh văn", "tiếng anh", "english", "anh ngữ", "ngoại ngữ anh"],
        "IELTS": ["ielts", "anh văn ielts", "tiếng anh ielts", "english test prep", "luyện thi ielts"],
        "Toán": ["toán học", "math", "mathematics"],
        "Ngữ văn": ["văn", "văn học", "môn văn"],
    }
