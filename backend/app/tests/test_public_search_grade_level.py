from decimal import Decimal
import pytest
import pytest_asyncio
from fastapi import Depends, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import BigInteger, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db
from app.main import app
from app.models import Base
from app.models.course_class import CourseClass
from app.models.subject import Subject
from app.models.tutor_profile import TutorProfile
from app.models.tutor_subject import TutorSubject
from app.models.user_account import UserAccount


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
async def test_public_browse_tutor_grade_level_and_approved_status(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Create Subject A and Subject B
    subject_math = Subject(name="Toán Học", status="ACTIVE")
    subject_physics = Subject(name="Vật Lý", status="ACTIVE")
    db_session.add_all([subject_math, subject_physics])
    await db_session.flush()

    # Create Tutor A
    tutor_account = UserAccount(
        email="tutor-search@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia Sư Search Test",
        status="ACTIVE",
    )
    db_session.add(tutor_account)
    await db_session.flush()

    tutor = TutorProfile(
        account_id=tutor_account.id,
        verification_status="VERIFIED",
        bio="Hello I am teaching maths and physics",
        teaching_area="Hà Nội",
        teaching_mode="BOTH",
    )
    db_session.add(tutor)
    await db_session.flush()

    # Add TutorSubject A (Math, grade Lớp 10, APPROVED)
    tutor_subj_a = TutorSubject(
        tutor_id=tutor.id,
        subject_id=subject_math.id,
        grade_level="Lớp 10",
        fee_per_session=Decimal("200000"),
        status="APPROVED",
    )
    # Add TutorSubject B (Physics, grade Lớp 11, PENDING)
    tutor_subj_b = TutorSubject(
        tutor_id=tutor.id,
        subject_id=subject_physics.id,
        grade_level="Lớp 11",
        fee_per_session=Decimal("220000"),
        status="PENDING",
    )
    db_session.add_all([tutor_subj_a, tutor_subj_b])
    await db_session.commit()

    # Case 1: Search by APPROVED grade level "Lớp 10" -> should find the tutor
    response = await client.get("/api/v1/tutor/public/browse?q=Lớp%2010")
    assert response.status_code == 200
    tutors = response.json()["data"]
    assert len(tutors) == 1
    assert tutors[0]["id"] == tutor.id

    # Case 2: Search by PENDING grade level "Lớp 11" -> should NOT find the tutor because it is not APPROVED
    response = await client.get("/api/v1/tutor/public/browse?q=Lớp%2011")
    assert response.status_code == 200
    tutors = response.json()["data"]
    assert len(tutors) == 0

    # Case 2.1: Search by APPROVED subject name "Toán Học" -> should find the tutor
    response = await client.get("/api/v1/tutor/public/browse?q=Toán%20Học")
    assert response.status_code == 200
    tutors = response.json()["data"]
    assert len(tutors) == 1
    assert tutors[0]["id"] == tutor.id

    # Case 2.2: Search by PENDING subject name "Vật Lý" -> should NOT find the tutor because it is not APPROVED
    response = await client.get("/api/v1/tutor/public/browse?q=Vật%20Lý")
    assert response.status_code == 200
    tutors = response.json()["data"]
    assert len(tutors) == 0

    # Case 3: Filter by APPROVED Subject ID -> should find the tutor
    response = await client.get(f"/api/v1/tutor/public/browse?subject_id={subject_math.id}")
    assert response.status_code == 200
    tutors = response.json()["data"]
    assert len(tutors) == 1
    assert tutors[0]["id"] == tutor.id

    # Case 4: Filter by PENDING Subject ID -> should NOT find the tutor because it is PENDING
    response = await client.get(f"/api/v1/tutor/public/browse?subject_id={subject_physics.id}")
    assert response.status_code == 200
    tutors = response.json()["data"]
    assert len(tutors) == 0


@pytest.mark.asyncio
async def test_public_browse_classes_grade_level(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Create Subject and Tutor
    subject = Subject(name="Hóa Học", status="ACTIVE")
    tutor_account = UserAccount(
        email="tutor-class-search@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia Sư Class Search",
        status="ACTIVE",
    )
    db_session.add_all([subject, tutor_account])
    await db_session.flush()

    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED")
    db_session.add(tutor)
    await db_session.flush()

    # Create Group Class with grade level "Lớp 12"
    course_class = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp chuyên đề Hóa",
        grade_level="Lớp 12",
        goal="Đỗ đại học",
        fee_per_session_per_student=Decimal("150000"),
        total_sessions=10,
        min_students=1,
        max_students=10,
        mode="ONLINE",
        status="ENROLLING",
    )
    db_session.add(course_class)
    await db_session.commit()

    # Case 1: Search by grade level "Lớp 12" -> should find the class
    response = await client.get("/api/v1/tutor/public/classes?q=Lớp%2012")
    assert response.status_code == 200
    classes = response.json()["data"]
    assert len(classes) == 1
    assert classes[0]["id"] == course_class.id

    # Case 2: Search by unrelated grade level "Lớp 9" -> should NOT find the class
    response = await client.get("/api/v1/tutor/public/classes?q=Lớp%209")
    assert response.status_code == 200
    classes = response.json()["data"]
    assert len(classes) == 0
