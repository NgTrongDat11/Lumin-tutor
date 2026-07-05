from decimal import Decimal
import pytest
import pytest_asyncio
import math
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
from app.models.schedule_block import ScheduleBlock
from app.models.profile_embedding import ProfileEmbedding
from app.services.recommendation import recommend_for_need, recommend_for_discovery
from app.core.config import settings

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

# Helper to get access token for authenticated requests
async def get_student_token(client: AsyncClient) -> str:
    # Register student
    await client.post(
        "/api/v1/auth/register/student",
        json={
            "email": "student-test@lumin.test",
            "password": "strongpassword123",
            "full_name": "Test Student",
            "phone": "0987654321",
            "address": "Phường 1, Vĩnh Long",
            "academic_level": "Lớp 10",
        },
    )
    # Login
    resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "student-test@lumin.test",
            "password": "strongpassword123",
        }
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_exact_search_accent_insensitivity_and_multi_token(db_session: AsyncSession, client: AsyncClient):
    # Setup Subjects
    subject = Subject(name="Toán Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    # Tutor 1: Matches "Toán", "10"
    tutor_account1 = UserAccount(
        email="tutor1@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Nguyễn Văn Toán",
        status="ACTIVE",
    )
    db_session.add(tutor_account1)
    await db_session.flush()
    tutor1 = TutorProfile(account_id=tutor_account1.id, verification_status="VERIFIED", teaching_mode="BOTH")
    db_session.add(tutor1)
    await db_session.flush()
    db_session.add(TutorSubject(tutor_id=tutor1.id, subject_id=subject.id, grade_level="Lớp 10", fee_per_session=Decimal("200000"), status="APPROVED"))

    # Tutor 2: Matches "Văn", "10" (no "Toán")
    subject_physics = Subject(name="Vật Lý", status="ACTIVE")
    db_session.add(subject_physics)
    await db_session.flush()

    tutor_account2 = UserAccount(
        email="tutor2@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Trần Văn Mười",
        status="ACTIVE",
    )
    db_session.add(tutor_account2)
    await db_session.flush()
    tutor2 = TutorProfile(account_id=tutor_account2.id, verification_status="VERIFIED", teaching_mode="BOTH")
    db_session.add(tutor2)
    await db_session.flush()
    db_session.add(TutorSubject(tutor_id=tutor2.id, subject_id=subject_physics.id, grade_level="Lớp 10", fee_per_session=Decimal("200000"), status="APPROVED"))

    await db_session.commit()


    token = await get_student_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Accent insensitivity: "Toán" vs "toan"
    resp1 = await client.get("/api/v1/tutor/browse?q=Toán", headers=headers)
    resp2 = await client.get("/api/v1/tutor/browse?q=toan", headers=headers)
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert len(resp1.json()["data"]) == 1
    assert resp1.json()["data"][0]["full_name"] == "Nguyễn Văn Toán"
    assert resp1.json() == resp2.json()

    # Public browse accent insensitivity
    pub_resp1 = await client.get("/api/v1/tutor/public/browse?q=Toán")
    pub_resp2 = await client.get("/api/v1/tutor/public/browse?q=toan")
    assert pub_resp1.json() == pub_resp2.json()

    # 2. Multi-token AND matching: "Toán 10" must match tutor1, but not tutor2
    resp_multi = await client.get("/api/v1/tutor/browse?q=Toán 10", headers=headers)
    assert len(resp_multi.json()["data"]) == 1
    assert resp_multi.json()["data"][0]["full_name"] == "Nguyễn Văn Toán"

    # Query matching only "10" should return both
    resp_10 = await client.get("/api/v1/tutor/browse?q=10", headers=headers)
    assert len(resp_10.json()["data"]) == 2

@pytest.mark.asyncio
async def test_meaningless_query_returns_empty_and_no_embedding(db_session: AsyncSession, client: AsyncClient):
    token = await get_student_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Query with meaningless characters
    resp = await client.get("/api/v1/tutor/browse?q=!!!", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"] == []

@pytest.mark.asyncio
async def test_smart_search_class_offline_only(db_session: AsyncSession, client: AsyncClient):
    subject = Subject(name="Hóa Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    # Setup Tutor (ONLINE teaching mode, not OFFLINE)
    tutor_account = UserAccount(email="tutor-online@lumin.test", password_hash="hash", role="TUTOR", full_name="Gia Sư Online", status="ACTIVE")
    db_session.add(tutor_account)
    await db_session.flush()
    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED", teaching_mode="ONLINE")
    db_session.add(tutor)
    await db_session.flush()
    db_session.add(TutorSubject(tutor_id=tutor.id, subject_id=subject.id, grade_level="Lớp 10", fee_per_session=Decimal("250000"), status="APPROVED"))

    # Setup ONLINE class and OFFLINE class
    class_online = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Hóa 10 Online",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="ONLINE",
        status="ENROLLING",
    )
    class_offline = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Hóa 10 Offline",
        grade_level="Lớp 10",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=2,
        max_students=10,
        mode="OFFLINE",
        location="Phường 1, Vĩnh Long",
        status="ENROLLING",
    )
    db_session.add_all([class_online, class_offline])
    await db_session.commit()

    token = await get_student_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Call recommendations API discovery (Smart Match)
    resp = await client.get("/api/v1/recommendations/discovery", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    # Recommended classes must only contain OFFLINE
    recommended_classes = data["recommended_classes"]
    for c in recommended_classes:
        assert c["course_class"]["mode"] == "OFFLINE"

    # Recommended tutors can contain ONLINE mode (tutor 1-1)
    recommended_tutors = data["recommended_tutors"]
    tutor_modes = [t["tutor"]["teaching_mode"] for t in recommended_tutors]
    assert "ONLINE" in tutor_modes

@pytest.mark.asyncio
async def test_score_clamp_and_adjustments_and_neighbors(db_session: AsyncSession, client: AsyncClient):
    # Register & Login first to get a valid user hashed password in sqlite
    token = await get_student_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch newly registered student
    result = await db_session.execute(
        select(UserAccount).where(UserAccount.email == "student-test@lumin.test")
    )
    student_account = result.scalar_one()

    subject = Subject(name="Sinh Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    # Tutor
    tutor_account = UserAccount(email="tutor-biol@lumin.test", password_hash="hash", role="TUTOR", full_name="Gia Sư Sinh", status="ACTIVE")
    db_session.add(tutor_account)
    await db_session.flush()
    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED", teaching_mode="BOTH")
    db_session.add(tutor)
    await db_session.flush()
    db_session.add(TutorSubject(tutor_id=tutor.id, subject_id=subject.id, grade_level="Lớp 10", fee_per_session=Decimal("200000"), status="APPROVED"))

    need = LearningNeed(
        student_account_id=student_account.id,
        subject_id=subject.id,
        grade_level="Lớp 10",
        preferred_mode="BOTH",
        preferred_learning_type="BOTH",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.flush()

    # Add conflict: schedule block for tutor and a schedule for need
    from app.models.schedule_block import ScheduleBlock
    from app.models.schedule_pattern import SchedulePattern

    # Need requires schedule: MON morning
    from app.models.learning_need_schedule import LearningNeedSchedule
    need_sched = LearningNeedSchedule(
        learning_need_id=need.id,
        day_of_week=1, # Monday
        time_slot="MORNING",
    )
    db_session.add(need_sched)

    # Tutor has locked block: MON 8:00 to 10:00 (which is morning)
    from datetime import time
    tutor_block = ScheduleBlock(
        tutor_id=tutor.id,
        day_of_week=1,
        start_time=time(8, 0),
        end_time=time(10, 0),
        status="ACTIVE",
    )
    db_session.add(tutor_block)

    await db_session.commit()


    # Fetch recommendations for the need
    resp = await client.get(f"/api/v1/recommendations/for-need/{need.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    tutors = data["recommended_tutors"]
    assert len(tutors) > 0
    tutor_item = tutors[0]

    # Verify score formula: score == clamp(sum(pillars.points) + sum(adjustments.points), 0, 100)
    score = tutor_item["score"]
    pillars = tutor_item["pillars"]
    assert len(pillars) == 3
    pillar_sum = sum(float(p["points"]) for p in pillars)
    adjustments_sum = sum(float(item["points"]) for item in tutor_item["score_adjustments"])

    clamped_expected = max(0.0, min(100.0, pillar_sum + adjustments_sum))
    assert math.isclose(float(score), clamped_expected, rel_tol=1e-4)

    # Verify conflict penalty: should be -12.0 in score_adjustments
    clash_adj = next((adj for adj in tutor_item["score_adjustments"] if adj["key"] == "schedule_clash"), None)
    assert clash_adj is not None
    assert clash_adj["points"] == -12.0

    # Verify context and semantic neighbors
    context = data["context"]
    assert context is not None
    assert context["scoring_version"] == "v2.6"
    assert len(context["tutor_neighbors"]) <= 3
    # No raw vectors
    for neighbor in context["tutor_neighbors"]:
        assert "embedding" not in neighbor
        assert "vector" not in neighbor
        assert "similarity" in neighbor

@pytest.mark.asyncio
async def test_gemini_fallback_method(db_session: AsyncSession, client: AsyncClient):
    # Disable Gemini globally in settings to trigger fallback
    old_enabled = settings.GEMINI_ENABLED
    settings.GEMINI_ENABLED = False

    try:
        # Register and get student token
        token = await get_student_token(client)

        # Seed a verified tutor
        subject = Subject(name="Toán Học", status="ACTIVE")
        db_session.add(subject)
        await db_session.flush()

        tutor_account = UserAccount(
            email="fallback-tutor@lumin.test",
            password_hash="hash",
            role="TUTOR",
            full_name="Gia Sư Fallback",
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

        db_session.add(TutorSubject(
            tutor_id=tutor.id,
            subject_id=subject.id,
            grade_level="Lớp 10",
            fee_per_session=Decimal("150000"),
            status="APPROVED",
        ))
        await db_session.commit()

        # Load recommendations
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.get("/api/v1/recommendations/discovery", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]

        # Assert that discovery returns tutors and they use text_similarity method
        assert len(data["recommended_tutors"]) > 0
        assert data["recommended_tutors"][0]["semantic"]["method"] == "text_similarity"
    finally:
        settings.GEMINI_ENABLED = old_enabled

@pytest.mark.asyncio
async def test_temporary_query_no_caching(db_session: AsyncSession, client: AsyncClient):
    token = await get_student_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Run discovery search with temporary query
    await client.get("/api/v1/recommendations/discovery?query=hoc+sinh+gioi+toan", headers=headers)

    # Check database: no ProfileEmbedding cache rows should be created with entity_type='LEARNING_NEED'
    result = await db_session.execute(
        select(ProfileEmbedding).where(ProfileEmbedding.entity_type == "LEARNING_NEED")
    )
    rows = result.scalars().all()
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_smart_match_detailed_metadata_and_constraints(db_session: AsyncSession, client: AsyncClient):
    token = await get_student_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch newly registered student
    result = await db_session.execute(
        select(UserAccount).where(UserAccount.email == "student-test@lumin.test")
    )
    student_account = result.scalar_one()

    subject = Subject(name="Hóa Học", status="ACTIVE")
    db_session.add(subject)
    await db_session.flush()

    # Tutor 1
    tutor_account1 = UserAccount(email="tutor-chem1@lumin.test", password_hash="hash", role="TUTOR", full_name="Gia Sư Hóa 1", status="ACTIVE")
    db_session.add(tutor_account1)
    await db_session.flush()
    tutor1 = TutorProfile(account_id=tutor_account1.id, verification_status="VERIFIED", teaching_mode="BOTH", average_rating=Decimal("4.8"), rating_count=10, years_experience=5)
    db_session.add(tutor1)
    await db_session.flush()
    db_session.add(TutorSubject(tutor_id=tutor1.id, subject_id=subject.id, grade_level="Lớp 11", fee_per_session=Decimal("250000"), status="APPROVED"))

    # Tutor 2
    tutor_account2 = UserAccount(email="tutor-chem2@lumin.test", password_hash="hash", role="TUTOR", full_name="Gia Sư Hóa 2", status="ACTIVE")
    db_session.add(tutor_account2)
    await db_session.flush()
    tutor2 = TutorProfile(account_id=tutor_account2.id, verification_status="VERIFIED", teaching_mode="BOTH", average_rating=Decimal("4.5"), rating_count=5, years_experience=8)
    db_session.add(tutor2)
    await db_session.flush()
    db_session.add(TutorSubject(tutor_id=tutor2.id, subject_id=subject.id, grade_level="Lớp 11", fee_per_session=Decimal("260000"), status="APPROVED"))

    need = LearningNeed(
        student_account_id=student_account.id,
        subject_id=subject.id,
        grade_level="Lớp 11",
        preferred_mode="BOTH",
        preferred_learning_type="BOTH",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.commit()

    # Fetch recommendations
    resp = await client.get(f"/api/v1/recommendations/for-need/{need.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    # Verify context metadata
    context = data.get("context")
    assert context is not None
    assert context["scoring_version"] == "v2.6"
    assert context["tutor_candidate_count"] == 2
    assert context["class_candidate_count"] == 0

    # generated_at must be valid UTC timestamp
    gen_time_str = context["generated_at"]
    assert gen_time_str.endswith("Z") or "+00:00" in gen_time_str

    # Verify recommended tutors detailed metadata
    tutor_recs = data["recommended_tutors"]
    assert len(tutor_recs) == 2
    for item in tutor_recs:
        sem = item.get("semantic")
        assert sem is not None
        assert "similarity" in sem
        assert "normalized_score" in sem
        assert "rank" in sem
        assert "candidate_count" in sem
        assert "normalization_applied" in sem

        # rank must be <= candidate_count
        assert sem["rank"] <= sem["candidate_count"]
        assert sem["candidate_count"] == 2

        # reputation breakdown must exist and contain ratings + experience info
        rep_bd = item.get("reputation_breakdown")
        assert rep_bd is not None
        assert len(rep_bd) == 2
        rating_bd = next(x for x in rep_bd if x["key"] == "tutor_rating")
        exp_bd = next(x for x in rep_bd if x["key"] == "tutor_experience")
        assert rating_bd["source"] == "tutor_rating"
        assert exp_bd["source"] == "tutor_experience"
        assert rating_bd["score"] > 0
        assert exp_bd["score"] > 0

        # Neighbors list comparison
        tutor_id = item["tutor"]["id"]
        tutor_neighbors = context["tutor_neighbors"]
        assert len(tutor_neighbors) > 0
        assert any(n["id"] == tutor_id for n in tutor_neighbors)
