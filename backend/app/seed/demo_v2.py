"""Canonical, internally consistent data for the Lumin demo environment."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.audit_log import AuditLog
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.learning_need_schedule import LearningNeedSchedule
from app.models.learning_session import LearningSession
from app.models.message import Message
from app.models.message_thread import MessageThread
from app.models.message_thread_participant import MessageThreadParticipant
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.recommendation_event import RecommendationEvent
from app.models.review import Review
from app.models.schedule_block import ScheduleBlock
from app.models.schedule_pattern import SchedulePattern
from app.models.subject import Subject
from app.models.system_setting import SystemSetting
from app.models.teaching_contract import TeachingContract
from app.models.tutor_application import TutorApplication
from app.models.tutor_availability import TutorAvailability
from app.models.tutor_profile import TutorProfile
from app.models.tutor_qualification import TutorQualification
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount

TODAY = date.today()
MONEY = Decimal("0.01")
DEMO_SEED_VERSION = "v3-mekong-location"

VINH_LONG_TRA_VINH = "Phường Trà Vinh, Vĩnh Long"
VINH_LONG_LONG_DUC = "Phường Long Đức, Vĩnh Long"
VINH_LONG_NGUYET_HOA = "Phường Nguyệt Hóa, Vĩnh Long"
VINH_LONG_CANG_LONG = "Xã Càng Long, Vĩnh Long"
VINH_LONG_CHAU_THANH = "Xã Châu Thành, Vĩnh Long"
CAN_THO_NINH_KIEU = "Phường Ninh Kiều, Thành phố Cần Thơ"
CAN_THO_CAI_RANG = "Phường Cái Răng, Thành phố Cần Thơ"
DONG_THAP_CAO_LANH = "Phường Cao Lãnh, Đồng Tháp"
USERS = [
    ("superadmin@lumin.local", "admin123", "SUPER_ADMIN", "Quản trị viên Lumin", "0900000000", VINH_LONG_TRA_VINH),
    ("staff@lumin.local", "staff123", "STAFF", "Nguyễn Thu Hà", "0900000001", VINH_LONG_TRA_VINH),
    ("student@lumin.local", "student123", "STUDENT", "Nguyễn Minh Anh", "0901000001", VINH_LONG_TRA_VINH),
    ("student2@lumin.local", "student123", "STUDENT", "Trần Gia Huy", "0901000002", CAN_THO_NINH_KIEU),
    ("student3@lumin.local", "student123", "STUDENT", "Phạm Ngọc Linh", "0901000003", VINH_LONG_LONG_DUC),
    ("tutor_math@lumin.local", "tutor123", "TUTOR", "Lê Thanh Phong", "0912000001", CAN_THO_NINH_KIEU),
    ("tutor_english@lumin.local", "tutor123", "TUTOR", "Anna Taylor", "0912000002", CAN_THO_CAI_RANG),
    ("tutor_physics@lumin.local", "tutor123", "TUTOR", "Hoàng Anh Đức", "0912000003", VINH_LONG_LONG_DUC),
    ("tutor_ielts@lumin.local", "tutor123", "TUTOR", "Vũ Hoàng My", "0912000004", VINH_LONG_TRA_VINH),
    ("tutor_chem@lumin.local", "tutor123", "TUTOR", "Đặng Văn Hùng", "0912000005", VINH_LONG_NGUYET_HOA),
    ("tutor_pending@lumin.local", "tutor123", "TUTOR", "Nguyễn Thảo Linh", "0912000006", VINH_LONG_CANG_LONG),
    ("tutor_rejected@lumin.local", "tutor123", "TUTOR", "Phạm Quốc Bảo", "0912000007", DONG_THAP_CAO_LANH),
]
SUBJECTS = {
    "Toán": "Toán THPT và luyện thi tốt nghiệp.", "Vật lý": "Vật lý THPT.",
    "Hóa học": "Hóa THPT và luyện thi đại học.", "Tiếng Anh": "Tiếng Anh giao tiếp.",
    "IELTS": "IELTS theo band mục tiêu.", "Ngữ Văn": "Ngữ văn THCS và THPT.",
}


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(str(value)).quantize(MONEY)


def at(offset: int, hour: int = 19) -> datetime:
    return datetime.combine(TODAY + timedelta(days=offset), time(hour, 0))


async def add_user(db: AsyncSession, row: tuple[str, str, str, str, str, str]) -> UserAccount:
    email, password, role, name, phone, address = row
    user = UserAccount(email=email, password_hash=hash_password(password), role=role, full_name=name, phone=phone, address=address, status="ACTIVE")
    db.add(user)
    await db.flush()
    return user


async def add_tutor(db: AsyncSession, account: UserAccount, staff: UserAccount, subject: Subject, grade: str, fee: str, *, teaching_area: str, status: str = "VERIFIED", subject_status: str = "APPROVED", experience: int = 3, qualification: str = "Cử nhân") -> TutorProfile:
    verified = status == "VERIFIED"
    tutor = TutorProfile(account_id=account.id, bio=f"Gia sư {subject.name} trong dữ liệu demo.", qualification_level=qualification, years_experience=experience, teaching_mode="BOTH", teaching_area=teaching_area, verification_status=status, average_rating=Decimal("4.80") if verified else Decimal("0"), rating_count=12 if verified else 0)
    db.add(tutor)
    await db.flush()
    db.add_all([
        TutorSubject(tutor_id=tutor.id, subject_id=subject.id, grade_level=grade, fee_per_session=Decimal(fee), status=subject_status, review_note="Hồ sơ môn học hợp lệ." if verified else None, reviewed_by_account_id=staff.id if verified else None, reviewed_at=at(-30, 9) if verified else None),
        TutorAvailability(tutor_id=tutor.id, day_of_week=2, start_time=time(18), end_time=time(21), mode="BOTH"),
        TutorAvailability(tutor_id=tutor.id, day_of_week=6, start_time=time(9), end_time=time(12), mode="ONLINE"),
        TutorQualification(tutor_id=tutor.id, type="CERTIFICATE", title=f"Minh chứng chuyên môn {subject.name}", issuer="Lumin Education (demo)", file_url="/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt", status="APPROVED" if verified else "PENDING", review_note="Đã kiểm tra minh chứng demo." if verified else None, reviewed_by_account_id=staff.id if verified else None, reviewed_at=at(-30, 9) if verified else None),
    ])
    return tutor


async def add_need(db: AsyncSession, student: UserAccount, subject: Subject, grade: str, goal: str, min_budget: str, max_budget: str, mode: str, learning_type: str, day: int, *, preferred_area: str | None = None) -> LearningNeed:
    need = LearningNeed(student_account_id=student.id, subject_id=subject.id, grade_level=grade, goal=goal, budget_per_session_min=Decimal(min_budget), budget_per_session_max=Decimal(max_budget), preferred_mode=mode, preferred_learning_type=learning_type, preferred_area=preferred_area, raw_text=f"{DEMO_SEED_VERSION}:{student.email}:{subject.name}", parser_source="FORM", parsed_confidence=Decimal("0.950"), status="ACTIVE")
    db.add(need)
    await db.flush()
    db.add(LearningNeedSchedule(learning_need_id=need.id, day_of_week=day, start_time=time(19), end_time=time(21)))
    return need


async def add_class(db: AsyncSession, title: str, subject: Subject, tutor: TutorProfile | None, staff: UserAccount, grade: str, fee: str, sessions: int, status: str, offset: int, *, mode: str = "ONLINE", location: str = "Trực tuyến", private_request_id: int | None = None) -> CourseClass:
    start = TODAY + timedelta(days=offset)
    course_class = CourseClass(private_request_id=private_request_id, subject_id=subject.id, primary_tutor_id=tutor.id if tutor else None, title=title, grade_level=grade, goal=f"Lộ trình {sessions} buổi.", fee_per_session_per_student=Decimal(fee), total_sessions=sessions, min_students=1 if private_request_id else 2, max_students=1 if private_request_id else 8, mode=mode, location=location, start_date=start, end_date=start + timedelta(days=sessions * 3), status=status, created_by_account_id=staff.id)
    db.add(course_class)
    await db.flush()
    if tutor:
        db.add(SchedulePattern(class_id=course_class.id, day_of_week=2, start_time=time(19), end_time=time(21), start_date=start, end_date=course_class.end_date, total_sessions=sessions))
    return course_class


async def add_contract(db: AsyncSession, tutor: TutorProfile, center: str, tutor_share: str, status: str, name: str, *, request: PrivateTutoringRequest | None = None, course_class: CourseClass | None = None) -> TeachingContract:
    contract = TeachingContract(tutor_id=tutor.id, private_request_id=request.id if request else None, class_id=course_class.id if course_class else None, commission_name_snapshot=name, center_rate_snapshot=Decimal(center), tutor_rate_snapshot=Decimal(tutor_share), status=status)
    db.add(contract)
    await db.flush()
    return contract


async def add_payment(db: AsyncSession, student: UserAccount, target_type: str, target_id: int, contract: TeachingContract, amount: str, status: str, paid: datetime | None, label: str, code: str, *, refund: str | None = None, refund_reason: str | None = None) -> Payment:
    gross = Decimal(amount)
    recognized = status in {"SUCCEEDED", "REFUNDED"}
    center = money(gross * contract.center_rate_snapshot / Decimal("100")) if recognized else None
    tutor = money(gross - (center or Decimal("0"))) if recognized else None
    payment = Payment(student_account_id=student.id, target_type=target_type, target_id=target_id, contract_id=contract.id, amount=gross, status=status, provider="SEPAY" if recognized else "MOCK", provider_ref=code, billing_cycle_label=label, center_amount_snapshot=center, tutor_amount_snapshot=tutor, paid_at=paid, refund_amount=Decimal(refund) if refund else None, refund_reason=refund_reason, transfer_content=code, sepay_transaction_id=f"SEED-V3-{code}" if recognized else None, expires_at=at(3, 23) if not recognized else None)
    db.add(payment)
    await db.flush()
    return payment


def add_sessions(db: AsyncSession, tutor: TutorProfile, total: int, completed: int, offset: int, *, request_id: int | None = None, class_id: int | None = None) -> None:
    for number in range(1, total + 1):
        db.add(LearningSession(tutor_id=tutor.id, private_request_id=request_id, class_id=class_id, session_number=number, session_date=TODAY + timedelta(days=offset + (number - 1) * 3), start_time=time(19), end_time=time(21), status="COMPLETED" if number <= completed else "SCHEDULED"))


async def run_seed() -> None:
    """Create the canonical dataset after the application tables were truncated."""
    async with async_session_factory() as db:
        existing = (await db.execute(select(func.count()).select_from(UserAccount))).scalar_one()
        if existing:
            raise RuntimeError("Database vẫn có dữ liệu. Hãy dùng `python -m app.seed.reset_demo` để reset an toàn.")
        users = {row[0]: await add_user(db, row) for row in USERS}
        staff, s1, s2, s3 = users["staff@lumin.local"], users["student@lumin.local"], users["student2@lumin.local"], users["student3@lumin.local"]
        subjects: dict[str, Subject] = {}
        for name, description in SUBJECTS.items():
            subject = Subject(name=name, description=description, status="ACTIVE")
            db.add(subject)
            await db.flush()
            subjects[name] = subject

        t_math = await add_tutor(db, users["tutor_math@lumin.local"], staff, subjects["Toán"], "Lớp 12", "200000", teaching_area=CAN_THO_NINH_KIEU, experience=8, qualification="Thạc sĩ Toán học")
        t_english = await add_tutor(db, users["tutor_english@lumin.local"], staff, subjects["Tiếng Anh"], "Giao tiếp", "180000", teaching_area=CAN_THO_CAI_RANG, experience=5, qualification="TESOL")
        t_physics = await add_tutor(db, users["tutor_physics@lumin.local"], staff, subjects["Vật lý"], "Lớp 11", "180000", teaching_area=VINH_LONG_LONG_DUC, qualification="Kỹ sư Vật lý kỹ thuật")
        t_ielts = await add_tutor(db, users["tutor_ielts@lumin.local"], staff, subjects["IELTS"], "Band 5.5–6.5", "280000", teaching_area=VINH_LONG_TRA_VINH, experience=4, qualification="IELTS 8.0")
        t_chem = await add_tutor(db, users["tutor_chem@lumin.local"], staff, subjects["Hóa học"], "Lớp 12", "200000", teaching_area=VINH_LONG_CHAU_THANH, experience=6, qualification="Cử nhân Sư phạm Hóa")
        t_pending = await add_tutor(db, users["tutor_pending@lumin.local"], staff, subjects["Toán"], "Lớp 10", "150000", teaching_area=VINH_LONG_CANG_LONG, status="PENDING_REVIEW", subject_status="PENDING", experience=1)
        await add_tutor(db, users["tutor_rejected@lumin.local"], staff, subjects["Ngữ Văn"], "Lớp 9", "150000", teaching_area=DONG_THAP_CAO_LANH, status="REJECTED", subject_status="REJECTED", experience=2)

        need_ielts = await add_need(db, s1, subjects["IELTS"], "Lớp 12", "Đạt IELTS 6.5 trong 6 tháng.", "220000", "300000", "ONLINE", "PRIVATE", 2)
        need_math = await add_need(db, s2, subjects["Toán"], "Lớp 12", "Củng cố kiến thức và đạt 8+.", "150000", "220000", "BOTH", "BOTH", 4)
        need_physics = await add_need(db, s3, subjects["Vật lý"], "Lớp 11", "Nắm chắc điện học trong học kỳ II.", "160000", "220000", "OFFLINE", "PRIVATE", 6)

        req_ielts = PrivateTutoringRequest(student_account_id=s1.id, tutor_id=t_ielts.id, learning_need_id=need_ielts.id, subject_id=subjects["IELTS"].id, grade_level="Lớp 12", goal="Tăng Writing và Speaking để đạt IELTS 6.5.", requested_sessions=10, agreed_fee_per_session=Decimal("280000"), mode="ONLINE", status="PAID", tutor_response_note="Đã thống nhất lộ trình 10 buổi.", confirmed_at=at(-16, 10))
        req_math = PrivateTutoringRequest(student_account_id=s2.id, tutor_id=t_math.id, learning_need_id=need_math.id, subject_id=subjects["Toán"].id, grade_level="Lớp 12", goal="Ôn chuyên đề hàm số và xác suất.", requested_sessions=10, agreed_fee_per_session=Decimal("200000"), mode="OFFLINE", status="REFUNDED", tutor_response_note="Đã hoàn tiền một phần do đổi lịch học.", confirmed_at=at(-28, 10))
        req_physics = PrivateTutoringRequest(student_account_id=s3.id, tutor_id=t_physics.id, learning_need_id=need_physics.id, subject_id=subjects["Vật lý"].id, grade_level="Lớp 11", goal="Củng cố chương Điện học.", requested_sessions=10, agreed_fee_per_session=Decimal("180000"), mode="OFFLINE", status="PAYMENT_PENDING", tutor_response_note="Gia sư đã xác nhận lịch học.", confirmed_at=at(-1, 10))
        req_pending = PrivateTutoringRequest(student_account_id=s1.id, tutor_id=t_pending.id, subject_id=subjects["Toán"].id, grade_level="Lớp 10", goal="Cần gia sư kèm nền tảng Toán.", requested_sessions=8, mode="OFFLINE", status="SENT")
        db.add_all([req_ielts, req_math, req_physics, req_pending])
        await db.flush()

        private_ielts = await add_class(db, "Kèm riêng IELTS – Nguyễn Minh Anh", subjects["IELTS"], t_ielts, staff, "Lớp 12", "280000", 10, "ONGOING", -12, private_request_id=req_ielts.id)
        private_math = await add_class(db, "Kèm riêng Toán – Trần Gia Huy", subjects["Toán"], t_math, staff, "Lớp 12", "200000", 10, "ONGOING", -30, mode="OFFLINE", location=CAN_THO_NINH_KIEU, private_request_id=req_math.id)
        private_physics = await add_class(db, "Kèm riêng Vật lý – Phạm Ngọc Linh", subjects["Vật lý"], t_physics, staff, "Lớp 11", "180000", 10, "READY", 3, mode="OFFLINE", location=VINH_LONG_LONG_DUC, private_request_id=req_physics.id)
        class_math = await add_class(db, "Toán 12 – Chinh phục 8+", subjects["Toán"], t_math, staff, "Lớp 12", "120000", 20, "ONGOING", -21, mode="OFFLINE", location=CAN_THO_NINH_KIEU)
        class_ielts = await add_class(db, "IELTS Foundation 5.5–6.5", subjects["IELTS"], t_ielts, staff, "Lớp 12", "180000", 12, "ENROLLING", 7)
        class_english = await add_class(db, "Tiếng Anh giao tiếp căn bản", subjects["Tiếng Anh"], t_english, staff, "Người đi làm", "180000", 10, "COMPLETED", -45, mode="OFFLINE", location=CAN_THO_CAI_RANG)
        class_chem = await add_class(db, "Hóa 12 – Luyện đề tốt nghiệp", subjects["Hóa học"], None, staff, "Lớp 12", "150000", 16, "TUTOR_RECRUITING", 14, mode="OFFLINE", location=VINH_LONG_CHAU_THANH)

        registrations = [
            ClassRegistration(class_id=private_ielts.id, student_account_id=s1.id, learning_need_id=need_ielts.id, status="PAID", reviewed_by_account_id=staff.id, reviewed_at=at(-16, 9), review_note="Đã tạo lớp 1-1."),
            ClassRegistration(class_id=private_math.id, student_account_id=s2.id, learning_need_id=need_math.id, status="REFUNDED", reviewed_by_account_id=staff.id, reviewed_at=at(-28, 9), review_note="Đã hoàn tiền một phần."),
            ClassRegistration(class_id=private_physics.id, student_account_id=s3.id, learning_need_id=need_physics.id, status="PAYMENT_PENDING", reviewed_by_account_id=staff.id, reviewed_at=at(-1, 9), review_note="Chờ thanh toán."),
            ClassRegistration(class_id=class_math.id, student_account_id=s2.id, learning_need_id=need_math.id, status="PAID", reviewed_by_account_id=staff.id, reviewed_at=at(-21, 9), review_note="Đã xếp lớp."),
            ClassRegistration(class_id=class_ielts.id, student_account_id=s1.id, learning_need_id=need_ielts.id, status="PAYMENT_PENDING", reviewed_by_account_id=staff.id, reviewed_at=at(-1, 9), review_note="Chờ học viên thanh toán."),
            ClassRegistration(class_id=class_english.id, student_account_id=s3.id, status="PAID", reviewed_by_account_id=staff.id, reviewed_at=at(-45, 9), review_note="Đã hoàn thành lớp."),
        ]
        db.add_all(registrations)
        await db.flush()
        reg_math, reg_ielts, reg_english = registrations[3], registrations[4], registrations[5]

        contract_ielts = await add_contract(db, t_ielts, "30", "70", "ACTIVE", "Tiêu chuẩn 30/70", request=req_ielts, course_class=private_ielts)
        contract_math_private = await add_contract(db, t_math, "50", "50", "ACTIVE", "Ưu đãi 50/50", request=req_math, course_class=private_math)
        contract_physics = await add_contract(db, t_physics, "30", "70", "PENDING", "Tiêu chuẩn 30/70", request=req_physics, course_class=private_physics)
        contract_math_class = await add_contract(db, t_math, "40", "60", "ACTIVE", "Lớp nhóm 40/60", course_class=class_math)
        contract_english_class = await add_contract(db, t_english, "50", "50", "COMPLETED", "Lớp nhóm 50/50", course_class=class_english)
        contract_ielts_class = await add_contract(db, t_ielts, "30", "70", "PENDING", "Tiêu chuẩn 30/70", course_class=class_ielts)

        await add_payment(db, s1, "PRIVATE_TUTORING_REQUEST", req_ielts.id, contract_ielts, "2800000", "SUCCEEDED", at(-14, 10), "Gói IELTS 10 buổi", "LUMIN-IELTS-001")
        await add_payment(db, s2, "PRIVATE_TUTORING_REQUEST", req_math.id, contract_math_private, "2000000", "REFUNDED", at(-25, 10), "Toán 1-1 10 buổi", "LUMIN-MATH-001", refund="400000", refund_reason="Điều chỉnh 2 buổi học chưa sử dụng.")
        await add_payment(db, s2, "CLASS_REGISTRATION", reg_math.id, contract_math_class, "2400000", "SUCCEEDED", at(-10, 10), "Toán 12 – chu kỳ tháng này", "LUMIN-CLASS-001")
        await add_payment(db, s3, "CLASS_REGISTRATION", reg_english.id, contract_english_class, "1800000", "SUCCEEDED", at(-40, 10), "Tiếng Anh giao tiếp – trọn khóa", "LUMIN-CLASS-002")
        await add_payment(db, s3, "PRIVATE_TUTORING_REQUEST", req_physics.id, contract_physics, "1800000", "PENDING", None, "Vật lý 1-1 10 buổi", "LUMIN-PENDING-001")
        await add_payment(db, s1, "CLASS_REGISTRATION", reg_ielts.id, contract_ielts_class, "2160000", "PENDING", None, "IELTS Foundation – trọn khóa", "LUMIN-PENDING-002")

        add_sessions(db, t_ielts, 10, 4, -12, request_id=req_ielts.id)
        add_sessions(db, t_math, 10, 6, -30, request_id=req_math.id)
        add_sessions(db, t_math, 8, 5, -15, class_id=class_math.id)
        add_sessions(db, t_english, 6, 6, -45, class_id=class_english.id)
        db.add_all([
            ScheduleBlock(tutor_id=t_ielts.id, private_request_id=req_ielts.id, day_of_week=2, start_time=time(19), end_time=time(21), status="ACTIVE"),
            ScheduleBlock(tutor_id=t_math.id, class_id=class_math.id, day_of_week=4, start_time=time(19), end_time=time(21), status="ACTIVE"),
            TutorApplication(class_id=class_chem.id, tutor_id=t_chem.id, status="APPLIED", message="Tôi có kinh nghiệm luyện đề Hóa 12."),
            TutorApplication(class_id=class_chem.id, tutor_id=t_physics.id, status="REJECTED", message="Không đúng chuyên môn lớp học.", reviewed_by_account_id=staff.id, reviewed_at=at(-2, 9)),
            Review(student_account_id=s3.id, tutor_id=t_english.id, target_type="CLASS_REGISTRATION", target_id=reg_english.id, rating=5, comment="Lớp học rõ ràng, dễ theo dõi."),
            RecommendationEvent(student_account_id=s1.id, learning_need_id=need_ielts.id, target_type="TUTOR", target_id=t_ielts.id, event_type="VIEW", score_snapshot=Decimal("92.5000"), reason_snapshot="Phù hợp mục tiêu IELTS và cùng khu vực Vĩnh Long."),
            Notification(user_id=t_ielts.account_id, notification_type="PAYMENT_CONFIRMED", title="Đã ghi nhận học phí", body="Học phí gói IELTS 10 buổi đã được ghi nhận.", reference_type="private_request", reference_id=req_ielts.id),
            Notification(user_id=s1.id, notification_type="REQUEST_CONFIRMED", title="Gia sư đã xác nhận", body="Bạn có thể theo dõi lịch học và chi tiết hợp đồng.", reference_type="private_request", reference_id=req_ielts.id),
            SystemSetting(key="default_commission_name", value="Tiêu chuẩn 30/70"),
            SystemSetting(key="demo_seed_version", value=DEMO_SEED_VERSION),
            AuditLog(actor_id=staff.id, action="SEED_DEMO_V3", target_type="SYSTEM", target_id=None, detail={"description": "Mekong-region canonical demo dataset"}),
        ])
        thread = MessageThread(private_request_id=req_ielts.id, title="Trao đổi lộ trình IELTS")
        db.add(thread)
        await db.flush()
        db.add_all([
            MessageThreadParticipant(thread_id=thread.id, account_id=s1.id),
            MessageThreadParticipant(thread_id=thread.id, account_id=t_ielts.account_id),
            Message(thread_id=thread.id, sender_id=s1.id, content="Em muốn ưu tiên kỹ năng Writing trong tháng đầu."),
            Message(thread_id=thread.id, sender_id=t_ielts.account_id, content="Cô sẽ gửi lộ trình và bài kiểm tra đầu vào trong buổi đầu tiên."),
        ])
        await db.commit()
    print("Canonical demo seed v3 completed.")


if __name__ == "__main__":
    asyncio.run(run_seed())
