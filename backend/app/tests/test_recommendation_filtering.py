from decimal import Decimal
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import BigInteger, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.main import app
from app.models import Base
from app.models.course_class import CourseClass
from app.models.subject import Subject
from app.models.tutor_profile import TutorProfile
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount
from app.models.learning_need import LearningNeed
from app.models.class_registration import ClassRegistration
from app.services.recommendation import recommend_for_need, recommend_for_discovery


@compiles(BigInteger, "sqlite")
def compile_big_int_sqlite(element, compiler, **kw):
    del element, compiler, kw
    return "INTEGER"


engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture(autouse=True)
def manage_dependency_overrides():
    old_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(old_overrides)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


@pytest.mark.asyncio
async def test_student_registration_constraints(client: AsyncClient):
    # Reject missing address
    response = await client.post(
        "/api/v1/auth/register/student",
        json={
            "email": "test-reg-fail1@lumin.test",
            "password": "strongpassword123",
            "full_name": "Test Student Fail 1",
            "phone": "0987654321",
            "academic_level": "Lớp 10",
        },
    )
    assert response.status_code == 422

    # Reject empty address
    response = await client.post(
        "/api/v1/auth/register/student",
        json={
            "email": "test-reg-fail2@lumin.test",
            "password": "strongpassword123",
            "full_name": "Test Student Fail 2",
            "phone": "0987654321",
            "address": "   ",
            "academic_level": "Lớp 10",
        },
    )
    assert response.status_code == 422

    # Reject missing academic_level
    response = await client.post(
        "/api/v1/auth/register/student",
        json={
            "email": "test-reg-fail3@lumin.test",
            "password": "strongpassword123",
            "full_name": "Test Student Fail 3",
            "phone": "0987654321",
            "address": "Vĩnh Long",
        },
    )
    assert response.status_code == 422

    # Accept valid registration
    response = await client.post(
        "/api/v1/auth/register/student",
        json={
            "email": "test-reg-ok@lumin.test",
            "password": "strongpassword123",
            "full_name": "Test Student OK",
            "phone": "0987654321",
            "address": "Phường 1, Vĩnh Long",
            "academic_level": "Lớp 10",
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_recommendations_class_filters_and_sorting(db_session: AsyncSession):
    # Setup Subject
    subject = Subject(name="Toán Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    # Setup Verified Tutor
    tutor_account = UserAccount(
        email="tutor-rec@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia Sư Toán",
        status="ACTIVE",
    )
    db_session.add(tutor_account)
    await db_session.flush()

    tutor = TutorProfile(
        account_id=tutor_account.id,
        verification_status="VERIFIED",
        teaching_mode="BOTH",
    )
    db_session.add(tutor)
    await db_session.flush()

    tutor_subject = TutorSubject(
        tutor_id=tutor.id,
        subject_id=subject.id,
        grade_level="Lớp 10",
        fee_per_session=Decimal("200000"),
        status="APPROVED",
    )
    db_session.add(tutor_subject)

    student = UserAccount(
        email="student-rec@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học Viên Test",
        address="Phường 1, Vĩnh Long",
        academic_level="Lớp 10",
        status="ACTIVE",
    )
    student2 = UserAccount(
        email="student2@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học Viên 2",
        address="Phường 1, Vĩnh Long",
        academic_level="Lớp 10",
        status="ACTIVE",
    )
    db_session.add_all([student, student2])
    await db_session.flush()

    # Classes:
    # 1. Valid Direct Class: cùng phường, lớp 10, OFFLINE (Vĩnh Long)
    class_valid_same_ward = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán 10 Same Ward",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )

    # 2. Valid Direct Class: cùng tỉnh, lớp 10, OFFLINE (Vĩnh Long but different ward)
    class_valid_same_prov = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán 10 Same Prov",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 2, Vĩnh Long",
        status="ENROLLING",
    )

    # 3. Exclude: ONLINE class
    class_online = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán 10 Online",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="ONLINE",
        location="Hà Nội",
        status="ENROLLING",
    )

    # 4. Exclude: BOTH class
    class_both = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán 10 Both",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="BOTH",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )

    # 5. Exclude: TUTOR_RECRUITING class
    class_recruiting = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp recruiting",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="TUTOR_RECRUITING",
    )

    # 6. Exclude: 1-1 class (max_students = 1)
    class_one_one = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp 1-1",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=1,
        max_students=1,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )

    # 7. Exclude: Full class (registered count = max_students)
    class_full = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp full",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=2,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )

    # 8. Exclude: Different province class (Cần Thơ)
    class_other_prov = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán Cần Thơ",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Quận Ninh Kiều, Cần Thơ",
        status="ENROLLING",
    )

    # 9. Exclude: Wrong grade level (Lớp 9)
    class_wrong_grade = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán 9",
        grade_level="Lớp 9",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )

    db_session.add_all([
        class_valid_same_ward, class_valid_same_prov, class_online, class_both,
        class_recruiting, class_one_one, class_full, class_other_prov, class_wrong_grade
    ])
    await db_session.flush()

    # Fill class registration for full class
    reg1 = ClassRegistration(class_id=class_full.id, student_account_id=student.id, status="APPROVED")
    reg2 = ClassRegistration(class_id=class_full.id, student_account_id=student2.id, status="PAID")
    db_session.add_all([reg1, reg2])
    await db_session.commit()

    # ──── Scenario 1: Cold Start ────
    res_cold = await recommend_for_discovery(student, db_session)
    tutors_cold = res_cold["tutors"]
    classes_cold = res_cold["classes"]

    # Must contain tutor
    assert len(tutors_cold) > 0
    # Must only contain the 2 valid offline classes: same ward and same province
    assert len(classes_cold) == 2
    titles_cold = [c["course_class"].title for c in classes_cold]
    assert "Lớp Toán 10 Same Ward" in titles_cold
    assert "Lớp Toán 10 Same Prov" in titles_cold
    # Check sorting order: same ward (level 2) must be first
    assert classes_cold[0]["course_class"].title == "Lớp Toán 10 Same Ward"
    assert classes_cold[1]["course_class"].title == "Lớp Toán 10 Same Prov"

    # ──── Scenario 2: Smart Match (OFFLINE) ────
    need = LearningNeed(
        student_account_id=student.id,
        subject_id=subject.id,
        grade_level="Lớp 10",
        preferred_mode="OFFLINE",
        status="ACTIVE",
    )
    res_smart = await recommend_for_need(need, db_session)
    tutors_smart = res_smart["tutors"]
    classes_smart = res_smart["classes"]

    assert len(tutors_smart) > 0
    assert len(classes_smart) == 2
    assert classes_smart[0]["course_class"].title == "Lớp Toán 10 Same Ward"

    # ──── Scenario 3: Smart Match (ONLINE) preferred mode ────
    need_online = LearningNeed(
        student_account_id=student.id,
        subject_id=subject.id,
        grade_level="Lớp 10",
        preferred_mode="ONLINE",
        status="ACTIVE",
    )
    res_online = await recommend_for_need(need_online, db_session)
    tutors_online = res_online["tutors"]
    classes_online_res = res_online["classes"]

    # Recommended tutors still exist
    assert len(tutors_online) > 0
    # Classes MUST be empty
    assert len(classes_online_res) == 0

    # ──── Scenario 4: Missing address or academic_level ────
    student_missing = UserAccount(
        email="student-missing@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học Viên Thiếu Info",
        address=None,
        academic_level=None,
        status="ACTIVE",
    )
    db_session.add(student_missing)
    await db_session.commit()

    res_missing = await recommend_for_discovery(student_missing, db_session)
    # Tutors still exist
    assert len(res_missing["tutors"]) > 0
    # Classes list must be empty
    assert len(res_missing["classes"]) == 0


@pytest.mark.asyncio
async def test_boundary_grade_levels(db_session: AsyncSession):
    # Setup Subject
    subject = Subject(name="Toán Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    # Student 1: Lớp 5 (Cấp 1 boundary)
    student_l5 = UserAccount(
        email="student-l5@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Student L5",
        address="Vĩnh Long",
        academic_level="Lớp 5",
        status="ACTIVE",
    )
    # Student 2: Lớp 6 (Cấp 2 boundary)
    student_l6 = UserAccount(
        email="student-l6@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Student L6",
        address="Vĩnh Long",
        academic_level="Lớp 6",
        status="ACTIVE",
    )
    # Student 3: Lớp 9 (Cấp 2 boundary)
    student_l9 = UserAccount(
        email="student-l9@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Student L9",
        address="Vĩnh Long",
        academic_level="Lớp 9",
        status="ACTIVE",
    )
    # Student 4: Lớp 10 (Cấp 3 boundary)
    student_l10 = UserAccount(
        email="student-l10@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Student L10",
        address="Vĩnh Long",
        academic_level="Lớp 10",
        status="ACTIVE",
    )
    db_session.add_all([student_l5, student_l6, student_l9, student_l10])
    await db_session.flush()

    # Class 1: Lớp 5 (Cấp 1)
    class_l5 = CourseClass(
        subject_id=subject.id,
        title="Lớp Toán Lớp 5",
        grade_level="Lớp 5",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Vĩnh Long",
        status="ENROLLING",
    )
    # Class 2: Lớp 6 (Cấp 2)
    class_l6 = CourseClass(
        subject_id=subject.id,
        title="Lớp Toán Lớp 6",
        grade_level="Lớp 6",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Vĩnh Long",
        status="ENROLLING",
    )
    # Class 3: Lớp 9 (Cấp 2)
    class_l9 = CourseClass(
        subject_id=subject.id,
        title="Lớp Toán Lớp 9",
        grade_level="Lớp 9",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Vĩnh Long",
        status="ENROLLING",
    )
    # Class 4: Lớp 10 (Cấp 3)
    class_l10 = CourseClass(
        subject_id=subject.id,
        title="Lớp Toán Lớp 10",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Vĩnh Long",
        status="ENROLLING",
    )
    db_session.add_all([class_l5, class_l6, class_l9, class_l10])
    await db_session.commit()

    # Student Lớp 5 gets Lớp 5 class but not Lớp 6
    res_l5 = await recommend_for_discovery(student_l5, db_session)
    classes_l5 = [c["course_class"].title for c in res_l5["classes"]]
    assert "Lớp Toán Lớp 5" in classes_l5
    assert "Lớp Toán Lớp 6" not in classes_l5

    # Student Lớp 6 gets Lớp 6 class but not Lớp 5
    res_l6 = await recommend_for_discovery(student_l6, db_session)
    classes_l6 = [c["course_class"].title for c in res_l6["classes"]]
    assert "Lớp Toán Lớp 6" in classes_l6
    assert "Lớp Toán Lớp 5" not in classes_l6

    # Student Lớp 9 gets Lớp 9 class but not Lớp 10
    res_l9 = await recommend_for_discovery(student_l9, db_session)
    classes_l9 = [c["course_class"].title for c in res_l9["classes"]]
    assert "Lớp Toán Lớp 9" in classes_l9
    assert "Lớp Toán Lớp 10" not in classes_l9

    # Student Lớp 10 gets Lớp 10 class but not Lớp 9
    res_l10 = await recommend_for_discovery(student_l10, db_session)
    classes_l10 = [c["course_class"].title for c in res_l10["classes"]]
    assert "Lớp Toán Lớp 10" in classes_l10
    assert "Lớp Toán Lớp 9" not in classes_l10

    # Fallback academic level check using Smart Match (recommend_for_need) with need.grade_level = None
    need_fallback = LearningNeed(
        student_account_id=student_l10.id,
        subject_id=subject.id,
        grade_level=None,
        preferred_mode="OFFLINE",
        status="ACTIVE",
    )
    need_fallback.schedules = []
    res_need_fallback = await recommend_for_need(need_fallback, db_session)
    class_item = res_need_fallback["classes"][0]
    # V2.5: for classes, grade is filtered at candidate level; check backward-compat score_breakdown
    breakdown = class_item["score_breakdown"]
    grade_breakdown = next(item for item in breakdown if item["key"] == "grade")
    assert grade_breakdown["score"] == 1.0
    assert grade_breakdown["status"] == "strong"


@pytest.mark.asyncio
async def test_snapshot_migration():
    import json
    from app.services.chat import _read_recommendation_snapshots

    # 1. Old snapshot (no scoring_version) -> skipped
    need_old = LearningNeed(
        student_account_id=1,
        recommendation_snapshot=json.dumps({
            "recommended_tutors": [{"tutor_name": "Old Tutor"}],
            "recommended_classes": [{"class_title": "Old Class", "mode": "ONLINE"}],
        })
    )
    # 2. V2.6 snapshot matching policy_version=2 -> kept
    need_v2_6 = LearningNeed(
        student_account_id=1,
        recommendation_snapshot=json.dumps({
            "recommended_tutors": [{"tutor_name": "New Tutor"}],
            "recommended_classes": [{"class_title": "New Class", "mode": "OFFLINE"}],
            "policy_version": 2,
            "scoring_version": "v2.6",
        })
    )
    # 3. V2.5 snapshot -> skipped under V2.6 scoring
    need_v2_5 = LearningNeed(
        student_account_id=1,
        recommendation_snapshot=json.dumps({
            "recommended_tutors": [{"tutor_name": "V2.5 Tutor"}],
            "recommended_classes": [{"class_title": "V2.5 Class", "mode": "OFFLINE"}],
            "policy_version": 2,
            "scoring_version": "v2.5",
        })
    )

    res = _read_recommendation_snapshots([need_old, need_v2_6, need_v2_5])
    # The reader skips need_old and need_v2_5 completely
    assert len(res) == 1
    # Only need_v2_6 is kept
    assert res[0]["recommended_tutors"] == [{"tutor_name": "New Tutor"}]
    assert res[0]["recommended_classes"] == [{"class_title": "New Class", "mode": "OFFLINE"}]


@pytest.mark.asyncio
async def test_chat_open_classes_filtering(db_session: AsyncSession):
    from app.services.chat import _get_open_group_classes

    # Setup Subject
    subject = Subject(name="Toán Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    student = UserAccount(
        email="chat-student@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Chat Student",
        address="Phường 1, Vĩnh Long",
        academic_level="Lớp 10",
        status="ACTIVE",
    )
    db_session.add(student)
    await db_session.flush()

    # Create various classes:
    # 1. Matching class (Vĩnh Long, Lớp 10, OFFLINE)
    cc_match = CourseClass(
        subject_id=subject.id,
        title="Class Match",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 2, Vĩnh Long",
        status="ENROLLING",
    )
    # 2. Online class
    cc_online = CourseClass(
        subject_id=subject.id,
        title="Class Online",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="ONLINE",
        location="Vĩnh Long",
        status="ENROLLING",
    )
    # 3. Wrong province
    cc_prov = CourseClass(
        subject_id=subject.id,
        title="Class Far",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Hà Nội",
        status="ENROLLING",
    )
    # 4. Wrong grade
    cc_grade = CourseClass(
        subject_id=subject.id,
        title="Class Wrong Grade",
        grade_level="Lớp 6",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Vĩnh Long",
        status="ENROLLING",
    )

    db_session.add_all([cc_match, cc_online, cc_prov, cc_grade])
    await db_session.commit()

    classes = await _get_open_group_classes(student, db_session)
    titles = [c["title"] for c in classes]
    assert "Class Match" in titles
    assert "Class Online" not in titles
    assert "Class Far" not in titles
    assert "Class Wrong Grade" not in titles


@pytest.mark.asyncio
async def test_chat_open_classes_limit_to_15(db_session: AsyncSession):
    from app.services.chat import _get_open_group_classes

    # Setup Subject
    subject = Subject(name="Toán Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    student = UserAccount(
        email="chat-limit-student@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Chat Limit Student",
        address="Phường 1, Vĩnh Long",
        academic_level="Lớp 10",
        status="ACTIVE",
    )
    db_session.add(student)
    await db_session.flush()

    # Create 20 matching classes
    classes_to_add = []
    for i in range(20):
        cc = CourseClass(
            subject_id=subject.id,
            title=f"Class {i}",
            grade_level="Lớp 10",
            fee_per_session_per_student=Decimal("150000"),
            total_sessions=10,
            min_students=2,
            max_students=10,
            mode="OFFLINE",
            location="Phường 1, Vĩnh Long",
            status="ENROLLING",
        )
        classes_to_add.append(cc)

    db_session.add_all(classes_to_add)
    await db_session.commit()

    classes = await _get_open_group_classes(student, db_session)
    assert len(classes) == 15


@pytest.mark.asyncio
async def test_class_reputation_v2_6_logic(db_session: AsyncSession):
    from app.models.subject import Subject
    from app.models.tutor_profile import TutorProfile
    from app.models.course_class import CourseClass
    from app.models.class_registration import ClassRegistration
    from app.models.review import Review
    from app.models.user_account import UserAccount
    from app.models.learning_need import LearningNeed
    from app.services.recommendation import _rank_class_candidates

    # Setup database records
    subject = Subject(name="Lịch Sử", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    student = UserAccount(email="std-hist@lumin.test", password_hash="hash", role="STUDENT", full_name="Hist Student", address="Phường 1, Vĩnh Long", academic_level="Lớp 12", status="ACTIVE")
    db_session.add(student)
    await db_session.flush()

    # Tutor 1: with rating
    tutor_account1 = UserAccount(email="tut-hist1@lumin.test", password_hash="hash", role="TUTOR", full_name="Tutor Hist 1", status="ACTIVE")
    db_session.add(tutor_account1)
    await db_session.flush()
    tutor1 = TutorProfile(account_id=tutor_account1.id, verification_status="VERIFIED", teaching_mode="BOTH", average_rating=Decimal("4.0"), rating_count=2, years_experience=5)
    db_session.add(tutor1)
    await db_session.flush()

    # Classes:
    # Class A: gán tutor1, chưa có review
    cc_a = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor1.id,
        title="Class A Hist",
        grade_level="Lớp 12",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )
    # Class B: không gán tutor, có review lớp
    cc_b = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=None,
        title="Class B Hist",
        grade_level="Lớp 12",
        fee_per_session_per_student=Decimal("160000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )
    db_session.add_all([cc_a, cc_b])
    await db_session.flush()

    # Add ClassRegistration for Class B and review
    reg_b = ClassRegistration(class_id=cc_b.id, student_account_id=student.id, status="PAID")
    db_session.add(reg_b)
    await db_session.flush()

    # review 1: của Class B, target_type="CLASS_REGISTRATION"
    rev_b = Review(student_account_id=student.id, tutor_id=tutor1.id, target_type="CLASS_REGISTRATION", target_id=reg_b.id, rating=4)
    db_session.add(rev_b)

    # review 2: target_type="TUTOR" (không thuộc CLASS_REGISTRATION) -> không được tính vào class reputation
    rev_fake = Review(student_account_id=student.id, tutor_id=tutor1.id, target_type="TUTOR", target_id=cc_a.id, rating=5)
    db_session.add(rev_fake)
    await db_session.commit()

    need = LearningNeed(
        student_account_id=student.id,
        subject_id=subject.id,
        grade_level="Lớp 12",
        preferred_mode="BOTH",
        preferred_learning_type="BOTH",
        status="ACTIVE",
    )

    from sqlalchemy.orm import selectinload
    classes_result = await db_session.execute(
        select(CourseClass)
        .options(selectinload(CourseClass.schedules))
        .where(CourseClass.id.in_([cc_a.id, cc_b.id]))
    )
    loaded_classes = {c.id: c for c in classes_result.scalars().all()}
    cc_a_loaded = loaded_classes[cc_a.id]
    cc_b_loaded = loaded_classes[cc_b.id]

    candidates = [
        {"course_class": cc_a_loaded, "current_count": 0, "area_level": 2, "semantic_score": 0.5, "raw_semantic_score": 0.5, "semantic_source": "gemini_embedding", "semantic_rank": 1},
        {"course_class": cc_b_loaded, "current_count": 1, "area_level": 2, "semantic_score": 0.5, "raw_semantic_score": 0.5, "semantic_source": "gemini_embedding", "semantic_rank": 2},
    ]

    scored, class_neighbors = await _rank_class_candidates(need, candidates, "Lớp 12", "Phường 1, Vĩnh Long", db_session)

    # Verify Class A (tutor prior, no class review)
    # Tutor 1: rating 4.0/5, exp 5 years
    # rating_score = 4.0/5 = 0.8. exp_score = 5/10 = 0.5. prior = 0.7*0.8 + 0.3*0.5 = 0.71.
    # class_reputation = prior = 0.71.
    # source should be primary_tutor, is_default should be False.
    item_a = next(x for x in scored if x["course_class"].id == cc_a.id)
    rep_a = item_a["reputation_breakdown"]
    assert len(rep_a) == 1
    assert rep_a[0]["source"] == "primary_tutor"
    assert rep_a[0]["score"] == 0.71
    assert item_a["pillars"][2]["is_default"] is False

    # Verify Class B (no tutor, has class review rating=4)
    # prior = 0.5. review_count = 1, avg_rating = 4.
    # class_reputation = (1 * (4/5) + 5 * 0.5) / 6 = (0.8 + 2.5) / 6 = 3.3 / 6 = 0.55
    # source should be class_reviews, is_default should be False.
    item_b = next(x for x in scored if x["course_class"].id == cc_b.id)
    rep_b = item_b["reputation_breakdown"]
    assert len(rep_b) == 2
    assert rep_b[0]["source"] == "class_reviews"
    assert rep_b[0]["score"] == 0.8
    assert rep_b[1]["source"] == "neutral_default"
    assert rep_b[1]["key"] == "neutral_prior"
    assert rep_b[1]["score"] == 0.5
    assert item_b["pillars"][2]["is_default"] is False
    assert abs(float(item_b["pillars"][2]["score"]) - 0.55) < 1e-4


@pytest.mark.asyncio
async def test_class_reputation_neutral_tutor_default(db_session: AsyncSession):
    from app.models.subject import Subject
    from app.models.tutor_profile import TutorProfile
    from app.models.course_class import CourseClass
    from app.models.user_account import UserAccount
    from app.models.learning_need import LearningNeed
    from app.services.recommendation import _rank_class_candidates
    from sqlalchemy.orm import selectinload

    subject = Subject(name="Địa Lý", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    student = UserAccount(email="std-geo@lumin.test", password_hash="hash", role="STUDENT", full_name="Geo Student", address="Phường 1, Vĩnh Long", academic_level="Lớp 12", status="ACTIVE")
    db_session.add(student)
    await db_session.flush()

    # Tutor mới, hoàn toàn chưa có rating/exp
    tutor_account = UserAccount(email="tut-geo@lumin.test", password_hash="hash", role="TUTOR", full_name="Tutor Geo", status="ACTIVE")
    db_session.add(tutor_account)
    await db_session.flush()
    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED", teaching_mode="BOTH", average_rating=Decimal("0"), rating_count=0, years_experience=None)
    db_session.add(tutor)
    await db_session.flush()

    cc = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Class Geo",
        grade_level="Lớp 12",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )
    db_session.add(cc)
    await db_session.commit()

    # Re-query using selectinload
    classes_result = await db_session.execute(
        select(CourseClass)
        .options(selectinload(CourseClass.schedules))
        .where(CourseClass.id == cc.id)
    )
    cc_loaded = classes_result.scalar_one()

    need = LearningNeed(
        student_account_id=student.id,
        subject_id=subject.id,
        grade_level="Lớp 12",
        status="ACTIVE",
    )

    candidates = [
        {"course_class": cc_loaded, "current_count": 0, "area_level": 2, "semantic_score": 0.5, "raw_semantic_score": 0.5, "semantic_source": "gemini_embedding", "semantic_rank": 1},
    ]

    scored, _ = await _rank_class_candidates(need, candidates, "Lớp 12", "Phường 1, Vĩnh Long", db_session)
    item = scored[0]

    # Prior must be 0.5, reputation_score must be 0.5 (5/10), is_default must be True, source must be neutral_default
    assert item["pillars"][2]["score"] == 0.5
    assert item["pillars"][2]["is_default"] is True
    assert item["reputation_breakdown"][0]["source"] == "neutral_default"
    assert item["reputation_breakdown"][0]["score"] == 0.5


@pytest.mark.asyncio
async def test_class_reputation_no_n_plus_one_queries(db_session: AsyncSession):
    from app.models.subject import Subject
    from app.models.tutor_profile import TutorProfile
    from app.models.course_class import CourseClass
    from app.models.user_account import UserAccount
    from app.models.learning_need import LearningNeed
    from app.services.recommendation import _rank_class_candidates
    from sqlalchemy.orm import selectinload
    from sqlalchemy import event

    subject = Subject(name="Lý Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    student = UserAccount(email="std-phy@lumin.test", password_hash="hash", role="STUDENT", full_name="Phy Student", address="Phường 1, Vĩnh Long", academic_level="Lớp 12", status="ACTIVE")
    db_session.add(student)
    await db_session.flush()

    # Create 3 tutors
    tutors = []
    for i in range(3):
        t_acc = UserAccount(email=f"tut-phy{i}@lumin.test", password_hash="hash", role="TUTOR", full_name=f"Tutor Phy {i}", status="ACTIVE")
        db_session.add(t_acc)
        await db_session.flush()
        t = TutorProfile(account_id=t_acc.id, verification_status="VERIFIED", teaching_mode="BOTH", average_rating=Decimal("4.5"), rating_count=1, years_experience=2)
        db_session.add(t)
        await db_session.flush()
        tutors.append(t)

    # Create 3 classes
    classes = []
    for i in range(3):
        cc = CourseClass(
            subject_id=subject.id,
            primary_tutor_id=tutors[i].id,
            title=f"Class Phy {i}",
            grade_level="Lớp 12",
            fee_per_session_per_student=Decimal("150000"),
            total_sessions=10,
            min_students=2,
            max_students=10,
            mode="OFFLINE",
            location="Phường 1, Vĩnh Long",
            status="ENROLLING",
        )
        db_session.add(cc)
        classes.append(cc)
    await db_session.commit()

    # Query using selectinload
    classes_result = await db_session.execute(
        select(CourseClass)
        .options(selectinload(CourseClass.schedules))
        .where(CourseClass.id.in_([c.id for c in classes]))
    )
    loaded_classes = classes_result.scalars().all()

    need = LearningNeed(
        student_account_id=student.id,
        subject_id=subject.id,
        grade_level="Lớp 12",
        status="ACTIVE",
    )

    candidates = [
        {"course_class": c, "current_count": 0, "area_level": 2, "semantic_score": 0.5, "raw_semantic_score": 0.5, "semantic_source": "gemini_embedding", "semantic_rank": idx + 1}
        for idx, c in enumerate(loaded_classes)
    ]

    # Setup query count event listener on the async engine
    queries = []
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    event.listen(db_session.bind.sync_engine, "before_cursor_execute", before_cursor_execute)
    try:
        scored, _ = await _rank_class_candidates(need, candidates, "Lớp 12", "Phường 1, Vĩnh Long", db_session)
    finally:
        event.remove(db_session.bind.sync_engine, "before_cursor_execute", before_cursor_execute)

    # There should only be 2 queries executed inside _rank_class_candidates:
    # 1. Select reviews for classes in a batch
    # 2. Select tutor profiles in a batch
    # (plus any potential lazy load queries if any, but there should be no lazy load)
    assert len(scored) == 3
    review_queries = [q for q in queries if "class_registrations" in q.lower() and "reviews" in q.lower()]
    tutor_subjects_queries = [q for q in queries if "tutor_subjects" in q.lower()]
    tutor_qualifications_queries = [q for q in queries if "tutor_qualifications" in q.lower()]

    assert len(review_queries) == 1
    assert len(tutor_subjects_queries) == 1
    assert len(tutor_qualifications_queries) == 1
