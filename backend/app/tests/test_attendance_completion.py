from datetime import date, time
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
from app.models.learning_session import LearningSession
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.subject import Subject
from app.models.teaching_contract import TeachingContract
from app.models.tutor_profile import TutorProfile
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
current_test_user_id: int | None = None


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


async def override_get_current_user(db: AsyncSession = Depends(get_db)):
    if current_test_user_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = await db.execute(
        select(UserAccount)
        .options(selectinload(UserAccount.tutor_profile))
        .where(UserAccount.id == current_test_user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
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


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    global current_test_user_id
    current_test_user_id = None
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


async def seed_tutor_and_subject(db: AsyncSession):
    tutor_account = UserAccount(
        email="attendance-tutor@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia sư điểm danh",
        status="ACTIVE",
    )
    student = UserAccount(
        email="attendance-student@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học viên điểm danh",
        status="ACTIVE",
    )
    subject = Subject(name="Toán", status="ACTIVE")
    db.add_all([tutor_account, student, subject])
    await db.flush()

    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED")
    db.add(tutor)
    await db.flush()

    return tutor_account, student, tutor, subject


@pytest.mark.asyncio
async def test_attendance_completed_on_last_class_session_finishes_class_and_contract(
    client: AsyncClient,
    db_session: AsyncSession,
):
    tutor_account, _, tutor, subject = await seed_tutor_and_subject(db_session)
    course_class = CourseClass(
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="Lớp Toán điểm danh",
        grade_level="Lớp 12",
        goal="Ôn thi",
        fee_per_session_per_student=Decimal("200000"),
        total_sessions=2,
        min_students=1,
        max_students=4,
        mode="ONLINE",
        status="ONGOING",
    )
    db_session.add(course_class)
    await db_session.flush()

    contract = TeachingContract(
        tutor_id=tutor.id,
        class_id=course_class.id,
        commission_name_snapshot="Default Commission",
        center_rate_snapshot=Decimal("30"),
        tutor_rate_snapshot=Decimal("70"),
        status="ACTIVE",
    )
    first_session = LearningSession(
        class_id=course_class.id,
        tutor_id=tutor.id,
        session_number=1,
        session_date=date(2026, 6, 1),
        start_time=time(19),
        end_time=time(21),
        status="COMPLETED",
    )
    last_session = LearningSession(
        class_id=course_class.id,
        tutor_id=tutor.id,
        session_number=2,
        session_date=date(2026, 6, 2),
        start_time=time(19),
        end_time=time(21),
        status="SCHEDULED",
    )
    db_session.add_all([contract, first_session, last_session])
    await db_session.commit()
    course_class_id = course_class.id
    contract_id = contract.id
    last_session_id = last_session.id

    global current_test_user_id
    current_test_user_id = tutor_account.id
    response = await client.put(
        f"/api/v1/sessions/{last_session_id}/attendance",
        json={"status": "COMPLETED", "attendance_note": "Đã học đủ buổi"},
    )

    assert response.status_code == 200
    db_session.expire_all()
    completed_class = await db_session.get(CourseClass, course_class_id)
    completed_contract = await db_session.get(TeachingContract, contract_id)
    completed_session = await db_session.get(LearningSession, last_session_id)
    assert completed_session.status == "COMPLETED"
    assert completed_session.attendance_note == "Đã học đủ buổi"
    assert completed_class.status == "COMPLETED"
    assert completed_contract.status == "COMPLETED"


@pytest.mark.asyncio
async def test_attendance_completed_on_request_only_session_finishes_private_request(
    client: AsyncClient,
    db_session: AsyncSession,
):
    tutor_account, student, tutor, subject = await seed_tutor_and_subject(db_session)
    request = PrivateTutoringRequest(
        student_account_id=student.id,
        tutor_id=tutor.id,
        subject_id=subject.id,
        grade_level="Lớp 10",
        goal="Bổ trợ kiến thức",
        requested_sessions=2,
        agreed_fee_per_session=Decimal("180000"),
        mode="ONLINE",
        status="PAID",
    )
    db_session.add(request)
    await db_session.flush()

    contract = TeachingContract(
        tutor_id=tutor.id,
        private_request_id=request.id,
        commission_name_snapshot="Default Commission",
        center_rate_snapshot=Decimal("30"),
        tutor_rate_snapshot=Decimal("70"),
        status="ACTIVE",
    )
    first_session = LearningSession(
        private_request_id=request.id,
        tutor_id=tutor.id,
        session_number=1,
        session_date=date(2026, 6, 1),
        start_time=time(19),
        end_time=time(21),
        status="COMPLETED",
    )
    last_session = LearningSession(
        private_request_id=request.id,
        tutor_id=tutor.id,
        session_number=2,
        session_date=date(2026, 6, 2),
        start_time=time(19),
        end_time=time(21),
        status="SCHEDULED",
    )
    db_session.add_all([contract, first_session, last_session])
    await db_session.commit()
    request_id = request.id
    contract_id = contract.id
    last_session_id = last_session.id

    global current_test_user_id
    current_test_user_id = tutor_account.id
    response = await client.put(
        f"/api/v1/sessions/{last_session_id}/attendance",
        json={"status": "COMPLETED"},
    )

    assert response.status_code == 200
    db_session.expire_all()
    completed_request = await db_session.get(PrivateTutoringRequest, request_id)
    completed_contract = await db_session.get(TeachingContract, contract_id)
    assert completed_request.status == "COMPLETED"
    assert completed_contract.status == "COMPLETED"