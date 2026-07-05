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
from app.models.message import Message
from app.models.notification import Notification
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.schedule_block import ScheduleBlock
from app.models.subject import Subject
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


async def seed_private_request(db: AsyncSession, status: str = "ONGOING"):
    tutor_account = UserAccount(
        email="location-tutor@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia sư cập nhật link",
        status="ACTIVE",
    )
    student = UserAccount(
        email="location-student@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học viên nhận link",
        status="ACTIVE",
    )
    staff = UserAccount(
        email="location-staff@lumin.test",
        password_hash="hash",
        role="STAFF",
        full_name="Nhân viên học vụ",
        status="ACTIVE",
    )
    subject = Subject(name="Toán", status="ACTIVE")
    db.add_all([tutor_account, student, staff, subject])
    await db.flush()

    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED")
    db.add(tutor)
    await db.flush()

    request = PrivateTutoringRequest(
        student_account_id=student.id,
        tutor_id=tutor.id,
        subject_id=subject.id,
        grade_level="Lớp 12",
        goal="Ôn thi",
        requested_sessions=4,
        agreed_fee_per_session=Decimal("200000"),
        mode="ONLINE",
        status=status,
    )
    db.add(request)
    await db.flush()

    course_class = CourseClass(
        private_request_id=request.id,
        subject_id=subject.id,
        primary_tutor_id=tutor.id,
        title="1-1 Toán - Lớp 12",
        grade_level="Lớp 12",
        goal="Ôn thi",
        fee_per_session_per_student=Decimal("200000"),
        total_sessions=4,
        min_students=1,
        max_students=1,
        mode="ONLINE",
        location="https://old.example/meet",
        status="READY",
        created_by_account_id=tutor_account.id,
    )
    db.add(course_class)
    await db.commit()
    return tutor_account, student, staff, request, course_class


@pytest.mark.asyncio
async def test_tutor_updates_location_for_ongoing_request(
    client: AsyncClient,
    db_session: AsyncSession,
):
    global current_test_user_id
    tutor_account, student, _, request, course_class = await seed_private_request(db_session)
    current_test_user_id = tutor_account.id

    response = await client.patch(
        f"/api/v1/private-requests/{request.id}/location",
        json={"location": "https://meet.example/new-room"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["class_location"] == "https://meet.example/new-room"

    await db_session.refresh(course_class)
    assert course_class.location == "https://meet.example/new-room"

    message = (await db_session.execute(select(Message))).scalar_one()
    assert message.sender_id == tutor_account.id
    assert message.content == "Gia sư đã cập nhật phòng/link học:\nhttps://meet.example/new-room"

    notification = (await db_session.execute(select(Notification))).scalar_one()
    assert notification.user_id == student.id
    assert notification.reference_type == "message_thread"


@pytest.mark.asyncio
async def test_tutor_cannot_update_completed_request_location(
    client: AsyncClient,
    db_session: AsyncSession,
):
    global current_test_user_id
    tutor_account, _, _, request, _ = await seed_private_request(db_session, status="COMPLETED")
    current_test_user_id = tutor_account.id

    response = await client.patch(
        f"/api/v1/private-requests/{request.id}/location",
        json={"location": "https://meet.example/new-room"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_student_cannot_update_request_location(
    client: AsyncClient,
    db_session: AsyncSession,
):
    global current_test_user_id
    _, student, _, request, _ = await seed_private_request(db_session)
    current_test_user_id = student.id

    response = await client.patch(
        f"/api/v1/private-requests/{request.id}/location",
        json={"location": "https://meet.example/new-room"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_staff_updates_any_request_location(
    client: AsyncClient,
    db_session: AsyncSession,
):
    global current_test_user_id
    _, _, staff, request, course_class = await seed_private_request(db_session, status="PAID")
    current_test_user_id = staff.id

    response = await client.patch(
        f"/api/v1/private-requests/{request.id}/location",
        json={"location": "Phòng A203"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["class_location"] == "Phòng A203"
    await db_session.refresh(course_class)
    assert course_class.location == "Phòng A203"

@pytest.mark.asyncio
async def test_tutor_confirm_request_returns_409_when_schedule_block_conflicts(
    client: AsyncClient,
    db_session: AsyncSession,
):
    global current_test_user_id

    tutor_account = UserAccount(
        email="conflict-tutor@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia sư đã kín lịch",
        status="ACTIVE",
    )
    student = UserAccount(
        email="conflict-student@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học viên mới",
        status="ACTIVE",
    )
    subject = Subject(name="Vật lý", status="ACTIVE")
    db_session.add_all([tutor_account, student, subject])
    await db_session.flush()

    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED")
    db_session.add(tutor)
    await db_session.flush()

    request = PrivateTutoringRequest(
        student_account_id=student.id,
        tutor_id=tutor.id,
        subject_id=subject.id,
        grade_level="Lớp 12",
        goal="Ôn thi",
        requested_sessions=6,
        mode="ONLINE",
        status="SENT",
    )
    db_session.add(request)
    await db_session.flush()

    db_session.add(
        ScheduleBlock(
            tutor_id=tutor.id,
            private_request_id=None,
            class_id=None,
            day_of_week=2,
            start_time=time(18, 0),
            end_time=time(20, 0),
            status="ACTIVE",
        )
    )
    await db_session.commit()

    current_test_user_id = tutor_account.id
    response = await client.post(
        f"/api/v1/private-requests/{request.id}/confirm",
        json={
            "agreed_fee_per_session": "220000",
            "agreed_sessions": 6,
            "schedules": [
                {
                    "day_of_week": 2,
                    "start_time": "19:00:00",
                    "end_time": "21:00:00",
                    "start_date": date(2026, 6, 29).isoformat(),
                    "total_sessions": 6,
                }
            ],
        },
    )

    assert response.status_code == 409
    assert "trùng khung" in response.json()["detail"]


@pytest.mark.asyncio
async def test_tutor_confirm_request_returns_409_when_confirmed_request_schedule_conflicts(
    client: AsyncClient,
    db_session: AsyncSession,
):
    global current_test_user_id

    tutor_account = UserAccount(
        email="tutor-conf@lumin.test",
        password_hash="hash",
        role="TUTOR",
        full_name="Gia sư bận",
        status="ACTIVE",
    )
    student1 = UserAccount(
        email="student1-conf@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học viên 1",
        status="ACTIVE",
    )
    student2 = UserAccount(
        email="student2-conf@lumin.test",
        password_hash="hash",
        role="STUDENT",
        full_name="Học viên 2",
        status="ACTIVE",
    )
    subject = Subject(name="Hóa học", status="ACTIVE")
    db_session.add_all([tutor_account, student1, student2, subject])
    await db_session.flush()

    tutor = TutorProfile(account_id=tutor_account.id, verification_status="VERIFIED")
    db_session.add(tutor)
    await db_session.flush()

    # Request A is confirmed (status = TUTOR_CONFIRMED)
    request_a = PrivateTutoringRequest(
        student_account_id=student1.id,
        tutor_id=tutor.id,
        subject_id=subject.id,
        grade_level="Lớp 11",
        goal="Học thêm",
        requested_sessions=10,
        mode="ONLINE",
        status="TUTOR_CONFIRMED",
    )
    db_session.add(request_a)
    await db_session.flush()

    # Add schedule pattern for Request A
    from app.models.schedule_pattern import SchedulePattern
    db_session.add(
        SchedulePattern(
            private_request_id=request_a.id,
            day_of_week=3,  # Wednesday
            start_time=time(14, 0),
            end_time=time(16, 0),
            start_date=date(2026, 7, 1),
            total_sessions=10,
        )
    )

    # Request B is SENT
    request_b = PrivateTutoringRequest(
        student_account_id=student2.id,
        tutor_id=tutor.id,
        subject_id=subject.id,
        grade_level="Lớp 11",
        goal="Học ôn",
        requested_sessions=5,
        mode="ONLINE",
        status="SENT",
    )
    db_session.add(request_b)
    await db_session.commit()

    # Try to confirm Request B with overlapping schedule (Wednesday 15:00 - 17:00)
    current_test_user_id = tutor_account.id
    response = await client.post(
        f"/api/v1/private-requests/{request_b.id}/confirm",
        json={
            "agreed_fee_per_session": "250000",
            "agreed_sessions": 5,
            "schedules": [
                {
                    "day_of_week": 3,
                    "start_time": "15:00:00",
                    "end_time": "17:00:00",
                    "start_date": date(2026, 7, 1).isoformat(),
                    "total_sessions": 5,
                }
            ],
        },
    )

    assert response.status_code == 409
    assert "trùng khung" in response.json()["detail"]


@pytest.mark.asyncio
async def test_student_registration_saves_school_and_academic_level(
    client: AsyncClient,
    db_session: AsyncSession,
):
    response = await client.post(
        "/api/v1/auth/register/student",
        json={
            "email": "test-student-fields@lumin.test",
            "password": "strongpassword123",
            "full_name": "Nguyễn Văn Trường",
            "phone": "0987654321",
            "address": "Hà Nội",
            "school": "THPT Chuyên Hà Nội - Amsterdam",
            "academic_level": "Lớp 10",
        },
    )
    assert response.status_code == 201
    assert "access_token" in response.json()

    user_result = await db_session.execute(
        select(UserAccount).where(UserAccount.email == "test-student-fields@lumin.test")
    )
    user = user_result.scalar_one_or_none()
    assert user is not None
    assert user.school == "THPT Chuyên Hà Nội - Amsterdam"
    assert user.academic_level == "Lớp 10"
