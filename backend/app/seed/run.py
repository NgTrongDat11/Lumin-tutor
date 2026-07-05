"""Seed demo data for local, Supabase, or R2-backed testing.

The script is intentionally idempotent: running it multiple times updates or
reuses the same demo records instead of creating duplicates.
"""

import asyncio
import mimetypes
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

import boto3
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import async_session_factory, engine
from app.models import Base
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.learning_need import LearningNeed
from app.models.learning_need_schedule import LearningNeedSchedule
from app.models.learning_session import LearningSession
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.schedule_block import ScheduleBlock
from app.models.schedule_pattern import SchedulePattern
from app.models.subject import Subject
from app.models.teaching_contract import TeachingContract
from app.models.tutor_application import TutorApplication
from app.models.tutor_availability import TutorAvailability
from app.models.tutor_profile import TutorProfile
from app.models.tutor_qualification import TutorQualification
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount


DEMO_USERS = [
    ("superadmin@lumin.local", "admin123", "SUPER_ADMIN", "Super Admin"),
    ("staff@lumin.local", "staff123", "STAFF", "Staff Lumin"),
    # Students
    ("student@lumin.local", "student123", "STUDENT", "Nguyễn Minh Anh"),
    ("student2@lumin.local", "student123", "STUDENT", "Trần Gia Bảo"),
    ("student3@lumin.local", "student123", "STUDENT", "Phạm Quỳnh Như"),
    # Tutors
    ("tutor_math@lumin.local", "tutor123", "TUTOR", "Lê Thanh Phong"),
    ("tutor_english@lumin.local", "tutor123", "TUTOR", "Anna Taylor"),
    ("tutor_physics@lumin.local", "tutor123", "TUTOR", "Hoàng Anh Đức"),
    ("tutor_ielts@lumin.local", "tutor123", "TUTOR", "Vũ Hoàng My"),
    ("tutor_chem@lumin.local", "tutor123", "TUTOR", "Đặng Văn Hùng"),
    ("tutor_pending@lumin.local", "tutor123", "TUTOR", "Nguyễn Thảo Linh"),
    ("tutor_rejected@lumin.local", "tutor123", "TUTOR", "Phạm Quốc Bảo"),
]

DEMO_USER_CONTACTS = {
    "student@lumin.local": {"phone": "0901000001", "address": "Quận 1, TP.HCM"},
    "student2@lumin.local": {"phone": "0901000002", "address": "Bình Thạnh, TP.HCM"},
    "student3@lumin.local": {"phone": "0901000003", "address": "Quận 7, TP.HCM"},
    "tutor_math@lumin.local": {"phone": "0912000001", "address": "Quận 1, TP.HCM"},
    "tutor_english@lumin.local": {"phone": "0912000002", "address": "Quận 3, TP.HCM"},
    "tutor_physics@lumin.local": {"phone": "0912000003", "address": "Bình Thạnh, TP.HCM"},
    "tutor_ielts@lumin.local": {"phone": "0912000004", "address": "Phú Nhuận, TP.HCM"},
    "tutor_chem@lumin.local": {"phone": "0912000005", "address": "Quận 10, TP.HCM"},
    "tutor_pending@lumin.local": {"phone": "0912000006", "address": "Tân Bình, TP.HCM"},
    "tutor_rejected@lumin.local": {"phone": "0912000007", "address": "Gò Vấp, TP.HCM"},
}

DEMO_SUBJECTS = [
    ("Toán", "Toán học THCS, THPT và luyện thi Đại học."),
    ("Vật lý", "Vật lý phổ thông và ôn thi tốt nghiệp."),
    ("Hóa học", "Hóa học phổ thông và luyện thi Đại học."),
    ("Tiếng Anh", "Tiếng Anh giao tiếp và học thuật phổ thông."),
    ("IELTS", "Luyện thi IELTS chuyên sâu theo band mục tiêu."),
    ("Ngữ Văn", "Ngữ văn THCS, THPT và ôn thi."),
]


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SEED_EVIDENCE_DIR = PROJECT_ROOT / "seed" / "qualification-evidence"

TUTOR_QUALIFICATION_SEEDS = {
    "tutor_math@lumin.local": [
        {
            "type": "DEGREE",
            "title": "Bằng Thạc sĩ Toán học",
            "issuer": "Trường Đại học Khoa học Tự nhiên",
            "filename": "le-thanh-phong-thac-si-toan.txt",
            "status": "APPROVED",
            "review_note": "Minh chứng hợp lệ, thông tin trùng khớp hồ sơ.",
        },
        {
            "type": "CERTIFICATE",
            "title": "Chứng nhận bồi dưỡng phương pháp luyện thi THPT",
            "issuer": "Viện Đào tạo Giáo viên Lumin",
            "filename": "le-thanh-phong-luyen-thi-thpt.txt",
            "status": "APPROVED",
            "review_note": "Đã đối chiếu nội dung chứng nhận.",
        },
    ],
    "tutor_english@lumin.local": [
        {
            "type": "CERTIFICATE",
            "title": "TESOL Certificate",
            "issuer": "Global TESOL Academy",
            "filename": "anna-taylor-tesol.txt",
            "status": "APPROVED",
            "review_note": "Certificate number and issuer look valid for demo data.",
        },
        {
            "type": "OTHER",
            "title": "Reference Letter - English Communication Coach",
            "issuer": "Lumin Demo Language Center",
            "filename": "anna-taylor-reference-letter.txt",
            "status": "APPROVED",
            "review_note": "Minh chứng kinh nghiệm giảng dạy được chấp nhận.",
        },
    ],
    "tutor_physics@lumin.local": [
        {
            "type": "OTHER",
            "title": "Thẻ sinh viên ngành Kỹ thuật Điện",
            "issuer": "Trường Đại học Bách Khoa",
            "filename": "hoang-anh-duc-student-card.txt",
            "status": "APPROVED",
            "review_note": "Xác nhận đang là sinh viên đúng chuyên ngành liên quan.",
        },
        {
            "type": "OTHER",
            "title": "Bảng điểm Vật lý đại cương",
            "issuer": "Trường Đại học Bách Khoa",
            "filename": "hoang-anh-duc-transcript.txt",
            "status": "PENDING",
            "review_note": None,
        },
    ],
    "tutor_ielts@lumin.local": [
        {
            "type": "CERTIFICATE",
            "title": "IELTS Academic 8.5",
            "issuer": "British Council",
            "filename": "vu-hoang-my-ielts-8-5.txt",
            "status": "APPROVED",
            "review_note": "Band score phù hợp nội dung hồ sơ.",
        },
        {
            "type": "DEGREE",
            "title": "Bằng Cử nhân Ngôn ngữ Anh",
            "issuer": "Trường Đại học Ngoại ngữ",
            "filename": "vu-hoang-my-cu-nhan-ngon-ngu-anh.txt",
            "status": "APPROVED",
            "review_note": "Minh chứng bằng cấp hợp lệ.",
        },
    ],
    "tutor_chem@lumin.local": [
        {
            "type": "DEGREE",
            "title": "Bằng Cử nhân Sư phạm Hóa học",
            "issuer": "Trường Đại học Sư phạm Hà Nội",
            "filename": "dang-van-hung-su-pham-hoa.txt",
            "status": "APPROVED",
            "review_note": "Đủ điều kiện xác minh hồ sơ giáo viên.",
        },
        {
            "type": "CERTIFICATE",
            "title": "Chứng nhận giáo viên dạy học sinh giỏi Hóa",
            "issuer": "Sở Giáo dục và Đào tạo Hà Nội",
            "filename": "dang-van-hung-hsg-hoa.txt",
            "status": "REJECTED",
            "review_note": "Bản scan thiếu trang xác nhận, yêu cầu tải lại.",
        },
    ],
    "tutor_pending@lumin.local": [
        {
            "type": "CERTIFICATE",
            "title": "Chứng chỉ Nghiệp vụ Sư phạm",
            "issuer": "Trung tâm Bồi dưỡng Nhà giáo",
            "filename": "nguyen-thao-linh-nghiep-vu-su-pham.txt",
            "status": "PENDING",
            "review_note": None,
        },
        {
            "type": "DEGREE",
            "title": "Bảng điểm Cử nhân Toán ứng dụng",
            "issuer": "Trường Đại học Sài Gòn",
            "filename": "nguyen-thao-linh-bang-diem-toan.txt",
            "status": "PENDING",
            "review_note": None,
        },
    ],
    "tutor_rejected@lumin.local": [
        {
            "type": "CERTIFICATE",
            "title": "Chứng chỉ Tin học ứng dụng",
            "issuer": "Trung tâm Tin học Demo",
            "filename": "pham-quoc-bao-tin-hoc-ung-dung.txt",
            "status": "REJECTED",
            "review_note": "Minh chứng không liên quan trực tiếp đến môn đăng ký dạy.",
        },
    ],
}


async def ensure_schema() -> None:
    """Create tables for local demo runs when migrations are not available yet."""
    # This ensures old tables might be created or updated if missing
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def storage_is_configured() -> bool:
    return all(
        [
            settings.S3_ENDPOINT_URL,
            settings.S3_ACCESS_KEY_ID,
            settings.S3_SECRET_ACCESS_KEY,
            settings.S3_BUCKET_NAME,
        ]
    )


def public_storage_url(s3_key: str) -> str:
    if settings.S3_PUBLIC_BASE_URL:
        return f"{settings.S3_PUBLIC_BASE_URL.rstrip('/')}/{s3_key}"
    if settings.SUPABASE_URL:
        return (
            f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/"
            f"{settings.S3_BUCKET_NAME}/{s3_key}"
        )
    return f"s3://{settings.S3_BUCKET_NAME}/{s3_key}"


async def upload_seed_evidence(local_path: Path, s3_key: str) -> str:
    """Upload a seed evidence file to R2/S3 and return the URL stored in DB."""
    if not storage_is_configured():
        relative_path = local_path.relative_to(PROJECT_ROOT).as_posix()
        return f"/{relative_path}"

    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        region_name="auto",
    )

    await asyncio.to_thread(
        client.upload_file,
        str(local_path),
        settings.S3_BUCKET_NAME,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )
    return public_storage_url(s3_key)


async def upsert_user(
    db: AsyncSession,
    email: str,
    password: str,
    role: str,
    full_name: str,
) -> UserAccount:
    contact = DEMO_USER_CONTACTS.get(email, {})
    result = await db.execute(select(UserAccount).where(UserAccount.email == email))
    user = result.scalar_one_or_none()
    if user:
        user.role = role
        user.full_name = full_name
        user.phone = contact.get("phone", user.phone)
        user.address = contact.get("address", user.address)
        user.status = "ACTIVE"
        return user

    user = UserAccount(
        email=email,
        password_hash=hash_password(password),
        role=role,
        full_name=full_name,
        phone=contact.get("phone"),
        address=contact.get("address"),
        status="ACTIVE",
    )
    db.add(user)
    await db.flush()
    return user


async def upsert_subject(db: AsyncSession, name: str, description: str) -> Subject:
    result = await db.execute(select(Subject).where(Subject.name == name))
    subject = result.scalar_one_or_none()
    if subject:
        subject.description = description
        subject.status = "ACTIVE"
        return subject

    subject = Subject(name=name, description=description, status="ACTIVE")
    db.add(subject)
    await db.flush()
    return subject


async def setup_tutor(
    db: AsyncSession,
    account: UserAccount,
    staff: UserAccount,
    bio: str,
    qual: str,
    exp: int,
    area: str,
    rating: Decimal,
    review_count: int,
    subject_configs: list[tuple[Subject, str, Decimal]],
    avail_configs: list[tuple[int, time, time]],
    verification_status: str = "VERIFIED",
    subject_status: str = "APPROVED",
) -> TutorProfile:
    result = await db.execute(
        select(TutorProfile).where(TutorProfile.account_id == account.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = TutorProfile(account_id=account.id)
        db.add(profile)
        await db.flush()

    profile.bio = bio
    profile.qualification_level = qual
    profile.years_experience = exp
    profile.teaching_mode = "BOTH"
    profile.teaching_area = area
    profile.verification_status = verification_status
    profile.average_rating = rating
    profile.rating_count = review_count

    # Subjects
    reviewed_at = datetime.utcnow()
    for subject, grade_level, fee in subject_configs:
        result = await db.execute(
            select(TutorSubject).where(
                TutorSubject.tutor_id == profile.id,
                TutorSubject.subject_id == subject.id,
                TutorSubject.grade_level == grade_level,
            )
        )
        t_sub = result.scalar_one_or_none()
        if not t_sub:
            t_sub = TutorSubject(
                tutor_id=profile.id,
                subject_id=subject.id,
                grade_level=grade_level,
                fee_per_session=fee,
            )
            db.add(t_sub)
        t_sub.fee_per_session = fee
        t_sub.status = subject_status
        t_sub.reviewed_by_account_id = staff.id if subject_status != "PENDING" else None
        t_sub.reviewed_at = reviewed_at if subject_status != "PENDING" else None

    # Availabilities
    for day_of_week, stime, etime in avail_configs:
        result = await db.execute(
            select(TutorAvailability).where(
                TutorAvailability.tutor_id == profile.id,
                TutorAvailability.day_of_week == day_of_week,
                TutorAvailability.start_time == stime,
                TutorAvailability.end_time == etime,
            )
        )
        if not result.scalar_one_or_none():
            db.add(
                TutorAvailability(
                    tutor_id=profile.id,
                    day_of_week=day_of_week,
                    start_time=stime,
                    end_time=etime,
                    mode="BOTH",
                )
            )

    await db.flush()
    return profile


async def upsert_tutor_qualification(
    db: AsyncSession,
    tutor: TutorProfile,
    staff: UserAccount,
    seed_data: dict,
) -> TutorQualification:
    local_path = SEED_EVIDENCE_DIR / seed_data["filename"]
    if not local_path.exists():
        raise FileNotFoundError(f"Missing seed evidence file: {local_path}")

    s3_key = f"certificates/seed/tutor-{tutor.id}/{seed_data['filename']}"
    file_url = await upload_seed_evidence(local_path, s3_key)

    result = await db.execute(
        select(TutorQualification).where(
            TutorQualification.tutor_id == tutor.id,
            TutorQualification.title == seed_data["title"],
        )
    )
    qualification = result.scalar_one_or_none()
    if not qualification:
        qualification = TutorQualification(
            tutor_id=tutor.id,
            type=seed_data["type"],
            title=seed_data["title"],
            file_url=file_url,
        )
        db.add(qualification)

    qualification.type = seed_data["type"]
    qualification.issuer = seed_data.get("issuer")
    qualification.file_url = file_url
    qualification.status = seed_data["status"]
    qualification.review_note = seed_data.get("review_note")
    if seed_data["status"] == "PENDING":
        qualification.reviewed_by_account_id = None
        qualification.reviewed_at = None
    else:
        qualification.reviewed_by_account_id = staff.id
        qualification.reviewed_at = datetime.utcnow()

    await db.flush()
    return qualification


async def seed_tutor_qualifications(
    db: AsyncSession,
    tutors_by_email: dict[str, TutorProfile],
    staff: UserAccount,
) -> None:
    for email, qualifications in TUTOR_QUALIFICATION_SEEDS.items():
        tutor = tutors_by_email[email]
        for qualification in qualifications:
            await upsert_tutor_qualification(db, tutor, staff, qualification)


async def seed_learning_need(
    db: AsyncSession,
    student: UserAccount,
    subject: Subject,
    grade: str,
    goal: str,
    min_b: str,
    max_b: str,
    tag: str,
) -> LearningNeed:
    result = await db.execute(
        select(LearningNeed).where(
            LearningNeed.student_account_id == student.id,
            LearningNeed.raw_text == tag,
        )
    )
    need = result.scalar_one_or_none()
    if not need:
        need = LearningNeed(
            student_account_id=student.id,
            raw_text=tag,
        )
        db.add(need)
        await db.flush()

    need.subject_id = subject.id
    need.grade_level = grade
    need.goal = goal
    need.budget_per_session_min = Decimal(min_b)
    need.budget_per_session_max = Decimal(max_b)
    need.preferred_mode = "BOTH"
    need.preferred_learning_type = "BOTH"
    need.preferred_area = "TP.HCM"
    need.parser_source = "FORM"
    need.parsed_confidence = Decimal("0.950")
    need.status = "ACTIVE"

    await db.flush()
    return need


async def setup_class(
    db: AsyncSession,
    title: str,
    subject: Subject,
    grade: str,
    fee: str,
    sessions: int,
    status: str,
    staff: UserAccount,
    tutor: TutorProfile | None = None,
    students: list[UserAccount] = [],
) -> CourseClass:
    result = await db.execute(
        select(CourseClass).where(CourseClass.title == title)
    )
    cls = result.scalar_one_or_none()
    if not cls:
        cls = CourseClass(
            title=title,
            subject_id=subject.id,
            grade_level=grade,
            fee_per_session_per_student=Decimal(fee),
            total_sessions=sessions,
            min_students=3,
            max_students=10,
            created_by_account_id=staff.id,
        )
        db.add(cls)
        await db.flush()

    cls.mode = "ONLINE" if "Online" in title else "OFFLINE"
    cls.status = status
    if tutor:
        cls.primary_tutor_id = tutor.id

    for st in students:
        result = await db.execute(
            select(ClassRegistration).where(
                ClassRegistration.class_id == cls.id,
                ClassRegistration.student_account_id == st.id,
            )
        )
        if not result.scalar_one_or_none():
            db.add(ClassRegistration(
                class_id=cls.id,
                student_account_id=st.id,
                status="APPROVED" if status in ["ONGOING", "COMPLETED"] else "PENDING"
            ))

    await db.flush()
    return cls


async def generate_sessions_for_class(
    db: AsyncSession,
    cls: CourseClass,
    tutor: TutorProfile,
    start_date: date,
    days_of_week: list[int],
    total_sessions: int,
):
    result = await db.execute(
        select(LearningSession).where(LearningSession.class_id == cls.id)
    )
    if result.scalars().first():
        return

    current_date = start_date
    session_num = 1
    
    while session_num <= total_sessions:
        if current_date.weekday() in days_of_week:
            # 19:00 - 21:00
            db.add(LearningSession(
                class_id=cls.id,
                tutor_id=tutor.id,
                session_number=session_num,
                session_date=current_date,
                start_time=time(19, 0),
                end_time=time(21, 0),
                status="COMPLETED" if current_date < date.today() else "SCHEDULED"
            ))
            session_num += 1
        current_date += timedelta(days=1)
    await db.flush()


async def run_seed() -> None:
    print("Creating database tables when missing...")
    await ensure_schema()

    print("Seeding Lumin demo data...")
    async with async_session_factory() as db:
        # 1. Users
        users = {
            email: await upsert_user(db, email, password, role, full_name)
            for email, password, role, full_name in DEMO_USERS
        }
        staff = users["staff@lumin.local"]
        s1, s2, s3 = users["student@lumin.local"], users["student2@lumin.local"], users["student3@lumin.local"]

        # 2. Subjects
        subjects = {
            name: await upsert_subject(db, name, description)
            for name, description in DEMO_SUBJECTS
        }

        # 3. Tutors
        t1 = await setup_tutor(
            db, users["tutor_math@lumin.local"], staff,
            "Thạc sĩ Toán học, 8 năm kinh nghiệm luyện thi ĐH khối A, A1.", "Thạc sĩ", 8, "Hà Nội", Decimal("4.9"), 45,
            [(subjects["Toán"], "Luyện thi THPT", Decimal("300000"))],
            [(1, time(18,0), time(21,0)), (3, time(18,0), time(21,0)), (5, time(18,0), time(21,0))]
        )
        t2 = await setup_tutor(
            db, users["tutor_english@lumin.local"], staff,
            "Giáo viên bản xứ, chuyên luyện phản xạ giao tiếp tự nhiên.", "TESOL", 5, "TP.HCM", Decimal("4.7"), 22,
            [(subjects["Tiếng Anh"], "Giao tiếp", Decimal("400000"))],
            [(7, time(9,0), time(12,0)), (6, time(9,0), time(12,0))]
        )
        t3 = await setup_tutor(
            db, users["tutor_physics@lumin.local"], staff,
            "Sinh viên ĐH Bách Khoa, thủ khoa đầu vào, nhiệt tình dễ hiểu.", "Sinh viên", 2, "TP.HCM", Decimal("4.8"), 12,
            [(subjects["Vật lý"], "Lớp 11-12", Decimal("150000")), (subjects["Toán"], "Lớp 10-12", Decimal("150000"))],
            [(2, time(19,0), time(21,0)), (4, time(19,0), time(21,0))]
        )
        t4 = await setup_tutor(
            db, users["tutor_ielts@lumin.local"], staff,
            "IELTS 8.5, chuyên trị kĩ năng Writing & Speaking cho người Việt.", "Cử nhân Ngôn Ngữ Anh", 4, "Đà Nẵng", Decimal("5.0"), 56,
            [(subjects["IELTS"], "Band 6.5 - 7.5+", Decimal("280000"))],
            [(1, time(19,0), time(21,0)), (3, time(19,0), time(21,0)), (6, time(15,0), time(17,0))]
        )
        t5 = await setup_tutor(
            db, users["tutor_chem@lumin.local"], staff,
            "Giáo viên Hóa trường chuyên, cung cấp phương pháp giải nhanh.", "Giáo viên", 10, "Hà Nội", Decimal("4.9"), 89,
            [(subjects["Hóa học"], "Luyện thi ĐH", Decimal("350000"))],
            [(7, time(19,0), time(21,0)), (4, time(19,0), time(21,0))]
        )
        t6 = await setup_tutor(
            db, users["tutor_pending@lumin.local"], staff,
            "Gia sư mới, chuyên kèm Toán căn bản cho học sinh mất gốc.", "Cử nhân Toán ứng dụng", 1, "TP.HCM", Decimal("0"), 0,
            [(subjects["Toán"], "Lớp 8-10", Decimal("180000"))],
            [(2, time(18,0), time(20,0)), (4, time(18,0), time(20,0))],
            verification_status="PENDING_REVIEW",
            subject_status="PENDING",
        )
        t7 = await setup_tutor(
            db, users["tutor_rejected@lumin.local"], staff,
            "Ứng viên đăng ký dạy Ngữ Văn nhưng minh chứng chưa phù hợp.", "Chứng chỉ bổ sung", 3, "Hà Nội", Decimal("0"), 0,
            [(subjects["Ngữ Văn"], "Lớp 6-9", Decimal("170000"))],
            [(3, time(19,0), time(21,0)), (5, time(19,0), time(21,0))],
            verification_status="REJECTED",
            subject_status="REJECTED",
        )

        tutors_by_email = {
            "tutor_math@lumin.local": t1,
            "tutor_english@lumin.local": t2,
            "tutor_physics@lumin.local": t3,
            "tutor_ielts@lumin.local": t4,
            "tutor_chem@lumin.local": t5,
            "tutor_pending@lumin.local": t6,
            "tutor_rejected@lumin.local": t7,
        }
        await seed_tutor_qualifications(db, tutors_by_email, staff)

        # 4. Learning Needs
        need_s1 = await seed_learning_need(db, s1, subjects["IELTS"], "Mất gốc", "Mục tiêu 6.5 IELTS trong 6 tháng.", "200000", "300000", "seed:ielts-s1")
        need_s2 = await seed_learning_need(db, s2, subjects["Toán"], "Lớp 12", "Cần gia sư luyện thi 8+ môn Toán.", "150000", "250000", "seed:math-s2")

        # 5. Classes (Multi statuses)
        c1 = await setup_class(db, "Lớp Toán 12 (Online) Nâng Cao", subjects["Toán"], "Lớp 12", "120000", 24, "ONGOING", staff, t1, [s1, s2])
        c2 = await setup_class(db, "IELTS 6.5 Masterclass", subjects["IELTS"], "Band 6.5", "180000", 36, "ENROLLING", staff, t4, [s3])
        c3 = await setup_class(db, "Tiếng Anh Giao Tiếp (Bản Xứ)", subjects["Tiếng Anh"], "Sơ cấp", "200000", 12, "COMPLETED", staff, t2, [s1, s3])
        c4 = await setup_class(db, "Lớp Lý 11 Cơ Bản", subjects["Vật lý"], "Lớp 11", "90000", 16, "TUTOR_RECRUITING", staff, None, [])
        c5 = await setup_class(db, "Hóa Học Luyện Thi", subjects["Hóa học"], "Lớp 12", "150000", 24, "ONGOING", staff, t5, [s2, s3])

        # 6. Generate Sessions for Student 1 (s1) to populate Schedule Page
        # Class 1 (ONGOING - started 2 weeks ago)
        await generate_sessions_for_class(db, c1, t1, date.today() - timedelta(days=14), [0, 2], 24)
        # Class 3 (COMPLETED - ended 1 month ago)
        await generate_sessions_for_class(db, c3, t2, date.today() - timedelta(days=60), [1, 3], 12)

        # 7. Private Request Flow for Student 1
        result = await db.execute(
            select(PrivateTutoringRequest).where(
                PrivateTutoringRequest.student_account_id == s1.id,
                PrivateTutoringRequest.tutor_id == t4.id,
            )
        )
        req = result.scalar_one_or_none()
        if not req:
            req = PrivateTutoringRequest(
                student_account_id=s1.id,
                tutor_id=t4.id,
                learning_need_id=need_s1.id,
                subject_id=subjects["IELTS"].id,
                grade_level="Mất gốc",
                goal="Kèm riêng IELTS 1-1 tăng kĩ năng Nói.",
                requested_sessions=10,
                mode="ONLINE",
            )
            db.add(req)
            await db.flush()
            
        req.status = "PAID"
        req.agreed_fee_per_session = Decimal("280000")
        
        # Payment for private request
        result = await db.execute(select(Payment).where(Payment.target_id == req.id, Payment.target_type == "PRIVATE_TUTORING_REQUEST"))
        if not result.scalar_one_or_none():
            db.add(Payment(student_account_id=s1.id, target_type="PRIVATE_TUTORING_REQUEST", target_id=req.id, amount=Decimal("2800000"), status="SUCCEEDED"))

        # Sessions for private request (started 1 week ago)
        result = await db.execute(select(LearningSession).where(LearningSession.private_request_id == req.id))
        if not result.scalars().first():
            start_date = date.today() - timedelta(days=7)
            for i in range(1, 11):
                db.add(LearningSession(
                    private_request_id=req.id,
                    tutor_id=t4.id,
                    session_number=i,
                    session_date=start_date,
                    start_time=time(15, 0),
                    end_time=time(17, 0),
                    status="COMPLETED" if start_date < date.today() else "SCHEDULED"
                ))
                start_date += timedelta(days=2)

        await db.commit()

    print("Seed completed.")
    print("Test Accounts:")
    for email, password, role, name in DEMO_USERS:
        print(f"  {role.ljust(12)} : {email} / {password}")


if __name__ == "__main__":
    from app.seed.demo_v2 import run_seed as run_seed_v2

    asyncio.run(run_seed_v2())
