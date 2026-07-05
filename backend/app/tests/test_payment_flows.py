from datetime import datetime
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
from app.models.class_registration import ClassRegistration
from app.models.course_class import CourseClass
from app.models.payment import Payment
from app.models.private_tutoring_request import PrivateTutoringRequest
from app.models.subject import Subject
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
        select(UserAccount).where(UserAccount.id == current_test_user_id)
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


async def seed_data(db: AsyncSession):
    student = UserAccount(email="student@test.com", password_hash="hash", role="STUDENT", full_name="Student", status="ACTIVE")
    staff = UserAccount(email="staff@test.com", password_hash="hash", role="STAFF", full_name="Staff", status="ACTIVE")
    db.add_all([student, staff])
    await db.flush()

    subject = Subject(name="Math", status="ACTIVE")
    db.add(subject)
    await db.flush()

    course_class = CourseClass(
        created_by_account_id=staff.id,
        subject_id=subject.id,
        title="Math Class",
        grade_level="Mọi cấp độ",
        mode="ONLINE",
        location="Zoom",
        total_sessions=10,
        fee_per_session_per_student=Decimal("100000"),
        max_students=5,
        status="ENROLLING",
    )
    db.add(course_class)
    await db.flush()
    
    registration = ClassRegistration(
        class_id=course_class.id,
        student_account_id=student.id,
        status="PAYMENT_PENDING"
    )
    db.add(registration)
    await db.flush()

    payment = Payment(
        student_account_id=student.id,
        target_type="CLASS_REGISTRATION",
        target_id=registration.id,
        amount=Decimal("1000000"),
        status="PENDING",
        provider="SEPAY"
    )
    db.add(payment)
    await db.commit()
    
    return student, staff, course_class, registration, payment


@pytest.mark.asyncio
async def test_regenerate_qr(client: AsyncClient, db_session: AsyncSession):
    student, _, _, _, payment = await seed_data(db_session)
    global current_test_user_id
    current_test_user_id = student.id

    response = await client.post(f"/api/v1/payments/{payment.id}/regenerate-qr")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["provider"] == "SEPAY"
    assert data["status"] == "PENDING"
    assert data["qr_data_url"] is not None


@pytest.mark.asyncio
async def test_cancel_payment(client: AsyncClient, db_session: AsyncSession):
    student, _, _, _, payment = await seed_data(db_session)
    global current_test_user_id
    current_test_user_id = student.id

    response = await client.post(f"/api/v1/payments/{payment.id}/cancel")
    assert response.status_code == 200
    data = response.json()["data"]
    # The returned payment should be the replacement one
    assert data["status"] == "PENDING"
    assert data["id"] != payment.id


@pytest.mark.asyncio
async def test_class_registration_without_tutor(client: AsyncClient, db_session: AsyncSession):
    student, staff, course_class, reg, _ = await seed_data(db_session)
    
    # Use existing registration and set to PENDING
    reg.status = "PENDING"
    await db_session.commit()
    await db_session.refresh(reg)

    global current_test_user_id
    current_test_user_id = staff.id

    # course_class has no primary_tutor_id, so approving should fail
    response = await client.post(f"/api/v1/classes/{course_class.id}/registrations/{reg.id}/review", json={"action": "APPROVED", "review_note": ""})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_partial_refund_keeps_target_status(client: AsyncClient, db_session: AsyncSession):
    student, staff, _, registration, payment = await seed_data(db_session)
    
    # Mark payment as SUCCEEDED and registration as PAID
    payment.status = "SUCCEEDED"
    registration.status = "PAID"
    await db_session.commit()

    global current_test_user_id
    current_test_user_id = staff.id

    # Partial refund
    response = await client.post(f"/api/v1/payments/{payment.id}/refund", json={"refund_amount": 500000, "refund_reason": "Partial"})
    assert response.status_code == 200
    
    await db_session.refresh(registration)
    # Registration should remain PAID, not REFUNDED
    assert registration.status == "PAID"
