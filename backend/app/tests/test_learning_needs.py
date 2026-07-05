import pytest
import pytest_asyncio
import asyncio
from datetime import time
from decimal import Decimal
from fastapi import Depends
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.compiler import compiles
from sqlalchemy import BigInteger

# SQLAlchemy helper to compile BigInteger to INTEGER on SQLite so autoincrement works
@compiles(BigInteger, "sqlite")
def compile_big_int_sqlite(element, compiler, **kw):
    return "INTEGER"

from app.main import app
from app.core.config import settings
from app.core.deps import get_db, get_current_user
from app.models import Base
from app.models.user_account import UserAccount
from app.models.subject import Subject
from app.models.learning_need import LearningNeed
from app.models.learning_need_schedule import LearningNeedSchedule
from app.models.tutor_profile import TutorProfile
from app.models.tutor_subject import TutorSubject
from app.models.course_class import CourseClass
from app.models.recommendation_event import RecommendationEvent

# Use an isolated SQLite memory database for the tests
DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Thread-safe/session-scoped test user ID reference
current_test_user_id = None


@pytest.fixture(autouse=True)
def disable_gemini_embeddings(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_ENABLED", False)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


async def override_get_current_user(db: AsyncSession = Depends(get_db)):
    global current_test_user_id
    if current_test_user_id is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    result = await db.execute(
        select(UserAccount)
        .options(selectinload(UserAccount.tutor_profile))
        .where(UserAccount.id == current_test_user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


@pytest.fixture(autouse=True)
def manage_dependency_overrides():
    old_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(old_overrides)


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    # Create all tables on the isolated DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Drop all tables after testing
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(scope="function")
async def test_subject(db_session: AsyncSession):
    subject = Subject(name="Toán Học Test", description="Test Subject", status="ACTIVE")
    db_session.add(subject)
    await db_session.commit()
    await db_session.refresh(subject)
    return subject


@pytest_asyncio.fixture(scope="function")
async def student1(db_session: AsyncSession):
    user = UserAccount(
        email="student1@lumin.test",
        password_hash="hashed_password",
        role="STUDENT",
        full_name="Student One",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture(scope="function")
async def student2(db_session: AsyncSession):
    user = UserAccount(
        email="student2@lumin.test",
        password_hash="hashed_password",
        role="STUDENT",
        full_name="Student Two",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_tutor_browse_prioritizes_same_area(
    client: AsyncClient, db_session: AsyncSession, student1: UserAccount
):
    global current_test_user_id
    student1.address = "Quận 1, TP.HCM"

    nearby_account = UserAccount(
        email="nearby-tutor@lumin.test",
        password_hash="hashed_password",
        role="TUTOR",
        full_name="Nearby Tutor",
        address="Q.1, Thành phố Hồ Chí Minh",
        status="ACTIVE",
    )
    far_account = UserAccount(
        email="far-tutor@lumin.test",
        password_hash="hashed_password",
        role="TUTOR",
        full_name="Far Tutor",
        address="Phường Thủ Đức, Thành phố Hồ Chí Minh",
        status="ACTIVE",
    )
    db_session.add_all([nearby_account, far_account])
    await db_session.flush()
    db_session.add_all([
        TutorProfile(
            account_id=nearby_account.id,
            verification_status="VERIFIED",
            average_rating=Decimal("4.00"),
            rating_count=2,
        ),
        TutorProfile(
            account_id=far_account.id,
            verification_status="VERIFIED",
            average_rating=Decimal("5.00"),
            rating_count=20,
        ),
    ])
    await db_session.commit()

    current_test_user_id = student1.id
    response = await client.get(
        "/api/v1/tutor/browse",
        headers={"Authorization": "Bearer dummy_token"},
    )

    assert response.status_code == 200
    tutors = response.json()["data"]
    assert [tutor["full_name"] for tutor in tutors[:2]] == ["Nearby Tutor", "Far Tutor"]


@pytest.mark.asyncio
async def test_student_class_browse_prioritizes_same_area(
    client: AsyncClient, db_session: AsyncSession, student1: UserAccount, test_subject: Subject
):
    global current_test_user_id
    student1.address = "Quận 1, TP.HCM"

    db_session.add_all([
        CourseClass(
            subject_id=test_subject.id,
            title="Near Class",
            grade_level="Lớp 12",
            goal="Ôn thi gần khu vực",
            fee_per_session_per_student=Decimal("120000"),
            total_sessions=12,
            min_students=2,
            max_students=8,
            mode="OFFLINE",
            location="Q.1, Thành phố Hồ Chí Minh",
            status="ENROLLING",
        ),
        CourseClass(
            subject_id=test_subject.id,
            title="Far Class",
            grade_level="Lớp 12",
            goal="Ôn thi xa khu vực",
            fee_per_session_per_student=Decimal("120000"),
            total_sessions=12,
            min_students=2,
            max_students=8,
            mode="OFFLINE",
            location="Phường Thủ Đức, TP.HCM",
            status="ENROLLING",
        ),
    ])
    await db_session.commit()

    current_test_user_id = student1.id
    response = await client.get(
        "/api/v1/classes",
        headers={"Authorization": "Bearer dummy_token"},
    )

    assert response.status_code == 200
    classes = response.json()["data"]
    assert [course["title"] for course in classes[:2]] == ["Near Class", "Far Class"]


@pytest.mark.asyncio
async def test_recommendation_uses_account_address_as_soft_area_score(
    client: AsyncClient,
    db_session: AsyncSession,
    student1: UserAccount,
    test_subject: Subject,
):
    global current_test_user_id
    student1.address = "Quận 1, TP.HCM"

    tutor_accounts = [
        UserAccount(
            email="matching-area@lumin.test",
            password_hash="hashed_password",
            role="TUTOR",
            full_name="Matching Area",
            status="ACTIVE",
        ),
        UserAccount(
            email="different-area@lumin.test",
            password_hash="hashed_password",
            role="TUTOR",
            full_name="Different Area",
            status="ACTIVE",
        ),
    ]
    db_session.add_all(tutor_accounts)
    await db_session.flush()

    tutor_profiles = [
        TutorProfile(
            account_id=tutor_accounts[0].id,
            teaching_mode="BOTH",
            teaching_area="Quận 1, TP.HCM",
            verification_status="VERIFIED",
        ),
        TutorProfile(
            account_id=tutor_accounts[1].id,
            teaching_mode="BOTH",
            teaching_area="Phường Thủ Đức, TP.HCM",
            verification_status="VERIFIED",
        ),
    ]
    db_session.add_all(tutor_profiles)
    await db_session.flush()
    db_session.add_all([
        TutorSubject(
            tutor_id=profile.id,
            subject_id=test_subject.id,
            grade_level="Lớp 12",
            fee_per_session=Decimal("200000"),
            status="APPROVED",
        )
        for profile in tutor_profiles
    ])
    need = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        grade_level="Lớp 12",
        goal="Ôn thi",
        preferred_mode="OFFLINE",
        preferred_learning_type="PRIVATE",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.commit()

    current_test_user_id = student1.id
    response = await client.get(
        f"/api/v1/recommendations/for-need/{need.id}",
        headers={"Authorization": "Bearer dummy_token"},
    )

    assert response.status_code == 200
    recommendations = response.json()["data"]["recommended_tutors"]
    assert [item["tutor"]["full_name"] for item in recommendations] == [
        "Matching Area",
        "Different Area",
    ]
    assert recommendations[0]["score"] > recommendations[1]["score"]
    assert "Gia sư ở cùng khu vực với bạn" not in recommendations[0]["reasons"]
    assert any("Khu vực dạy phù hợp" in reason for reason in recommendations[0]["reasons"])
    breakdown = recommendations[0]["score_breakdown"]
    assert len(breakdown) > 0
    # Invariant: sum of breakdown points + adjustments must equal the rounded score
    breakdown_sum = round(sum(item["points"] for item in breakdown), 2)
    adj_sum = round(sum(a["points"] for a in recommendations[0].get("score_adjustments", [])), 2)
    expected_score = round(float(recommendations[0]["score"]), 2)
    assert round(breakdown_sum + adj_sum, 2) == expected_score, (
        f"Breakdown sum {breakdown_sum} + adjustments {adj_sum} != score {expected_score}"
    )
    # V2.5: also check pillars exist
    pillars = recommendations[0]["pillars"]
    assert {item["key"] for item in pillars} >= {"ai", "practical", "reputation"}
    # area signal is in practical_breakdown
    practical_bd = recommendations[0]["practical_breakdown"]
    area_signal = next(item for item in practical_bd if item["key"] == "area")
    assert area_signal["score"] > 0
    assert area_signal["note"]


@pytest.mark.asyncio
async def test_discovery_recommendations_work_without_learning_need(
    client: AsyncClient,
    db_session: AsyncSession,
    student1: UserAccount,
    test_subject: Subject,
):
    global current_test_user_id
    student1.address = "Quận 1, TP.HCM"
    student1.academic_level = "Lớp 12"
    student1.learning_style = "Cần ôn thi lớp 12 theo lộ trình rõ ràng"

    tutor_accounts = [
        UserAccount(
            email="discovery-near@lumin.test",
            password_hash="hashed_password",
            role="TUTOR",
            full_name="Discovery Near",
            address="Quận 1, TP.HCM",
            status="ACTIVE",
        ),
        UserAccount(
            email="discovery-far@lumin.test",
            password_hash="hashed_password",
            role="TUTOR",
            full_name="Discovery Far",
            address="Hà Nội",
            status="ACTIVE",
        ),
    ]
    db_session.add_all(tutor_accounts)
    await db_session.flush()

    tutor_profiles = [
        TutorProfile(
            account_id=tutor_accounts[0].id,
            teaching_mode="BOTH",
            teaching_area="Quận 1, TP.HCM",
            verification_status="VERIFIED",
        ),
        TutorProfile(
            account_id=tutor_accounts[1].id,
            teaching_mode="BOTH",
            teaching_area="Hà Nội",
            verification_status="VERIFIED",
        ),
    ]
    db_session.add_all(tutor_profiles)
    await db_session.flush()
    db_session.add_all([
        TutorSubject(
            tutor_id=tutor_profiles[0].id,
            subject_id=test_subject.id,
            grade_level="Lớp 12",
            fee_per_session=Decimal("200000"),
            status="APPROVED",
        ),
        TutorSubject(
            tutor_id=tutor_profiles[1].id,
            subject_id=test_subject.id,
            grade_level="Lớp 6",
            fee_per_session=Decimal("200000"),
            status="APPROVED",
        ),
        CourseClass(
            subject_id=test_subject.id,
            title="Discovery Near Class",
            grade_level="Lớp 12",
            goal="Ôn thi lớp 12",
            fee_per_session_per_student=Decimal("120000"),
            total_sessions=12,
            min_students=2,
            max_students=8,
            mode="OFFLINE",
            location="Quận 1, TP.HCM",
            status="ENROLLING",
        ),
        CourseClass(
            subject_id=test_subject.id,
            title="Discovery Far Class",
            grade_level="Lớp 12",
            goal="Học nền tảng",
            fee_per_session_per_student=Decimal("120000"),
            total_sessions=12,
            min_students=2,
            max_students=8,
            mode="OFFLINE",
            location="Quận 7, TP.HCM",
            status="ENROLLING",
        ),
    ])
    await db_session.commit()

    current_test_user_id = student1.id
    response = await client.get(
        "/api/v1/recommendations/discovery",
        headers={"Authorization": "Bearer dummy_token"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert [item["tutor"]["full_name"] for item in data["recommended_tutors"][:2]] == [
        "Discovery Near",
        "Discovery Far",
    ]
    assert [item["course_class"]["title"] for item in data["recommended_classes"][:2]] == [
        "Discovery Near Class",
        "Discovery Far Class",
    ]
    assert data["recommended_tutors"][0]["score"] > data["recommended_tutors"][1]["score"]
    assert data["recommended_classes"][0]["score"] > data["recommended_classes"][1]["score"]
    assert data["recommended_tutors"][0]["score_breakdown"]
    assert data["recommended_classes"][0]["score_breakdown"]
    assert "Gợi ý khởi đầu" in data["recommended_tutors"][0]["reasons"][0]

    need_result = await db_session.execute(
        select(LearningNeed).where(LearningNeed.student_account_id == student1.id)
    )
    assert need_result.scalars().all() == []


@pytest.mark.asyncio
async def test_create_learning_need_success(
    client: AsyncClient, student1: UserAccount, test_subject: Subject
):
    global current_test_user_id
    current_test_user_id = student1.id

    headers = {"Authorization": "Bearer dummy_token"}
    payload = {
        "subject_id": test_subject.id,
        "grade_level": "Lớp 12",
        "goal": "Thi đại học 9 điểm",
        "budget_per_session_min": 150000,
        "budget_per_session_max": 250000,
        "preferred_mode": "BOTH",
        "preferred_learning_type": "BOTH",
        "preferred_area": "Quận 1",
        "schedules": [
            {"day_of_week": 2, "time_slot": "EVENING"},
            {"day_of_week": 4, "time_slot": "MORNING"},
        ],
    }

    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["student_account_id"] == student1.id
    assert data["grade_level"] == "Lớp 12"
    assert data["status"] == "ACTIVE"
    assert len(data["schedules"]) == 2


@pytest.mark.asyncio
async def test_create_learning_need_validations(client: AsyncClient, student1: UserAccount):
    global current_test_user_id
    current_test_user_id = student1.id
    headers = {"Authorization": "Bearer dummy_token"}

    # Invalid preferred_mode / enum
    payload = {"preferred_mode": "INVALID_MODE"}
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422

    # Negative budget
    payload = {"budget_per_session_min": -50000}
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422

    # Min budget > Max budget
    payload = {"budget_per_session_min": 200000, "budget_per_session_max": 100000}
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422

    # Schedule with both time_slot and start/end time
    payload = {
        "schedules": [
            {
                "day_of_week": 2,
                "time_slot": "MORNING",
                "start_time": "08:00:00",
                "end_time": "10:00:00",
            }
        ]
    }
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422

    # Duplicate schedule
    payload = {
        "schedules": [
            {"day_of_week": 2, "time_slot": "MORNING"},
            {"day_of_week": 2, "time_slot": "MORNING"},
        ]
    }
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422

    # Overlapping schedule time ranges
    payload = {
        "schedules": [
            {
                "day_of_week": 2,
                "start_time": "08:00:00",
                "end_time": "10:00:00",
            },
            {
                "day_of_week": 2,
                "start_time": "09:00:00",
                "end_time": "11:00:00",
            }
        ]
    }
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422

    # Overlapping slot and custom time range
    payload = {
        "schedules": [
            {
                "day_of_week": 2,
                "time_slot": "MORNING",
            },
            {
                "day_of_week": 2,
                "start_time": "09:00:00",
                "end_time": "11:00:00",
            }
        ]
    }
    response = await client.post("/api/v1/learning-needs", json=payload, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_learning_need_put_full_replacement(
    client: AsyncClient, student1: UserAccount, test_subject: Subject, db_session: AsyncSession
):
    global current_test_user_id
    current_test_user_id = student1.id
    headers = {"Authorization": "Bearer dummy_token"}

    # Create a need first
    need = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        grade_level="Lớp 10",
        goal="Học cơ bản",
        budget_per_session_min=Decimal("100000"),
        budget_per_session_max=Decimal("200000"),
        preferred_mode="ONLINE",
        preferred_learning_type="PRIVATE",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.flush()
    db_session.add(LearningNeedSchedule(learning_need_id=need.id, day_of_week=3, time_slot="AFTERNOON"))
    await db_session.commit()

    need_id = need.id

    # Update PUT (Full replacement)
    update_payload = {
        "subject_id": test_subject.id,
        "grade_level": "Lớp 11",
        "goal": "Nâng cao",
        "budget_per_session_min": 150000,
        "budget_per_session_max": 300000,
        "preferred_mode": "BOTH",
        "preferred_learning_type": "GROUP",
        "schedules": [
            {"day_of_week": 5, "time_slot": "MORNING"},
            {"day_of_week": 6, "time_slot": "EVENING"},
        ],
    }

    response = await client.put(
        f"/api/v1/learning-needs/{need_id}", json=update_payload, headers=headers
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["grade_level"] == "Lớp 11"
    assert data["goal"] == "Nâng cao"
    assert data["preferred_mode"] == "BOTH"
    assert data["preferred_learning_type"] == "GROUP"
    assert len(data["schedules"]) == 2
    assert {s["day_of_week"] for s in data["schedules"]} == {5, 6}

    # Verify database directly to check old schedules were deleted
    db_session.expire_all()
    result = await db_session.execute(
        select(LearningNeedSchedule).where(LearningNeedSchedule.learning_need_id == need_id)
    )
    db_schedules = result.scalars().all()
    assert len(db_schedules) == 2


@pytest.mark.asyncio
async def test_ownership_enforcement_returns_404(
    client: AsyncClient,
    student1: UserAccount,
    student2: UserAccount,
    test_subject: Subject,
    db_session: AsyncSession,
):
    # Student 1 owns the need
    need = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        grade_level="Lớp 12",
        goal="Học toán",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.commit()

    need_id = need.id

    # Student 2 tries to update or delete Student 1's need -> must return 404
    global current_test_user_id
    current_test_user_id = student2.id
    headers = {"Authorization": "Bearer dummy_token"}

    update_payload = {
        "subject_id": test_subject.id,
        "grade_level": "Lớp 12",
        "goal": "Học toán sửa",
        "preferred_mode": "BOTH",
        "preferred_learning_type": "BOTH",
        "schedules": [],
    }

    # PUT update
    response = await client.put(
        f"/api/v1/learning-needs/{need_id}", json=update_payload, headers=headers
    )
    assert response.status_code == 404

    # DELETE
    response = await client.delete(f"/api/v1/learning-needs/{need_id}", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_soft_delete_and_list_filtering(
    client: AsyncClient, student1: UserAccount, test_subject: Subject, db_session: AsyncSession
):
    global current_test_user_id
    current_test_user_id = student1.id
    headers = {"Authorization": "Bearer dummy_token"}

    # Create active need
    need = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        grade_level="Lớp 9",
        goal="Luyện thi vào 10",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.commit()

    need_id = need.id

    # Delete need (soft delete)
    response = await client.delete(f"/api/v1/learning-needs/{need_id}", headers=headers)
    assert response.status_code == 200

    # Expire cached session objects so query loads from DB
    db_session.expire_all()

    # Verify in DB direct query that status is ARCHIVED and snapshot is cleared
    result = await db_session.execute(
        select(LearningNeed).where(LearningNeed.id == need_id)
    )
    db_need = result.scalar_one()
    assert db_need.status == "ARCHIVED"
    assert db_need.recommendation_snapshot is None

    # Verify that listing defaults to ACTIVE only, so this archived need is not returned
    response = await client.get("/api/v1/learning-needs", headers=headers)
    assert response.status_code == 200
    needs_list = response.json()["data"]
    assert all(n["id"] != need_id for n in needs_list)

    # Verify that GET need detail now returns 404
    response = await client.get(f"/api/v1/learning-needs/{need_id}", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_recommendations_inactive_need_400(
    client: AsyncClient, student1: UserAccount, test_subject: Subject, db_session: AsyncSession
):
    global current_test_user_id
    current_test_user_id = student1.id
    headers = {"Authorization": "Bearer dummy_token"}

    # Create active need
    need_active = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        status="ACTIVE",
    )
    # Create archived need
    need_archived = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        status="ARCHIVED",
    )
    # Create fulfilled need (inactive)
    need_fulfilled = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        status="FULFILLED",
    )

    db_session.add(need_active)
    db_session.add(need_archived)
    db_session.add(need_fulfilled)
    await db_session.commit()

    need_active_id = need_active.id
    need_archived_id = need_archived.id
    need_fulfilled_id = need_fulfilled.id

    # Recommendations for ACTIVE need should succeed
    response = await client.get(
        f"/api/v1/recommendations/for-need/{need_active_id}", headers=headers
    )
    assert response.status_code == 200

    # Recommendations for ARCHIVED need should return 404 (since it's soft-deleted)
    response = await client.get(
        f"/api/v1/recommendations/for-need/{need_archived_id}", headers=headers
    )
    assert response.status_code == 404

    # Recommendations for FULFILLED need should return 400 (inactive configuration)
    response = await client.get(
        f"/api/v1/recommendations/for-need/{need_fulfilled_id}", headers=headers
    )
    assert response.status_code == 400

@pytest.mark.asyncio
async def test_log_recommendation_event_accepts_body_payload(
    client: AsyncClient,
    db_session: AsyncSession,
    student1: UserAccount,
    test_subject: Subject,
):
    global current_test_user_id
    current_test_user_id = student1.id
    headers = {"Authorization": "Bearer dummy_token"}

    need = LearningNeed(
        student_account_id=student1.id,
        subject_id=test_subject.id,
        grade_level="Lớp 12",
        goal="Ôn thi",
        status="ACTIVE",
    )
    db_session.add(need)
    await db_session.commit()

    response = await client.post(
        "/api/v1/recommendations/events",
        json={
            "event_type": "CLICK",
            "learning_need_id": need.id,
            "target_type": "TUTOR",
            "target_id": 123,
            "score_snapshot": "88.5",
            "reason_snapshot": ["Dạy môn phù hợp", "Lịch khớp 100%"],
        },
        headers=headers,
    )

    assert response.status_code == 201
    result = await db_session.execute(select(RecommendationEvent))
    event = result.scalar_one()
    assert event.student_account_id == student1.id
    assert event.learning_need_id == need.id
    assert event.target_type == "TUTOR"
    assert event.target_id == 123
    assert event.event_type == "CLICK"
    assert event.score_snapshot == Decimal("88.5000")
    assert event.reason_snapshot == "Dạy môn phù hợp\nLịch khớp 100%"
