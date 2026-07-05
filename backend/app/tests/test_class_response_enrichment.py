from types import SimpleNamespace

import pytest

from app.api.v1 import classes
from app.models.course_class import CourseClass
from app.schemas.course_class import CourseClassResponse


class _TutorResult:
    def first(self):
        return ("Gia sư Test", "/avatars/tutor.png")


class _ClassResult:
    def __init__(self, course_class: CourseClass):
        self.course_class = course_class

    def scalar_one_or_none(self):
        return self.course_class


class _FakeSession:
    def __init__(self, course_class: CourseClass | None = None):
        self.course_class = course_class
        self.events: list[str] = []

    async def execute(self, _statement):
        self.events.append("execute")
        if self.course_class is not None:
            return _ClassResult(self.course_class)
        return _TutorResult()

    async def flush(self):
        self.events.append("flush")

    async def refresh(self, _instance):
        self.events.append("refresh")

    async def commit(self):
        self.events.append("commit")


def _course_class() -> CourseClass:
    return CourseClass(
        id=1,
        private_request_id=None,
        subject_id=1,
        primary_tutor_id=10,
        title="Lớp Toán Test",
        grade_level="Lớp 12",
        goal="Ôn thi",
        fee_per_session_per_student=200_000,
        total_sessions=10,
        min_students=1,
        max_students=5,
        mode="ONLINE",
        location=None,
        start_date=None,
        end_date=None,
        status="READY",
        created_by_account_id=1,
        schedules=[],
    )


@pytest.mark.asyncio
async def test_enrich_class_response_with_assigned_tutor():
    response = CourseClassResponse.model_validate(_course_class())
    db = _FakeSession()

    enriched = await classes._enrich_class_response(response, db)

    assert enriched.tutor_name == "Gia sư Test"
    assert enriched.tutor_avatar_url == "/avatars/tutor.png"


@pytest.mark.asyncio
async def test_status_update_does_not_commit_when_response_enrichment_fails(monkeypatch):
    course_class = _course_class()
    db = _FakeSession(course_class)

    async def fail_enrichment(_response, _db):
        raise RuntimeError("response enrichment failed")

    monkeypatch.setattr(classes, "_enrich_class_response", fail_enrichment)

    with pytest.raises(RuntimeError, match="response enrichment failed"):
        await classes.update_class_status(
            class_id=course_class.id,
            new_status="ENROLLING",
            current_user=SimpleNamespace(role="STAFF"),
            db=db,
        )

    assert "flush" in db.events
    assert "commit" not in db.events
