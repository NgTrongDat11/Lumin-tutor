from types import SimpleNamespace

import pytest

from app.api.v1.private_requests import (
    CONTACT_VISIBLE_STATUSES,
    _can_view_student_contact,
    _can_view_tutor_contact,
)


@pytest.mark.parametrize("request_status", sorted(CONTACT_VISIBLE_STATUSES))
def test_confirmed_student_can_view_assigned_tutor_contact(request_status: str):
    student = SimpleNamespace(id=10, role="STUDENT")
    request = SimpleNamespace(
        student_account_id=10,
        tutor_id=20,
        status=request_status,
    )

    assert _can_view_tutor_contact(student, request) is True


def test_pending_student_cannot_view_tutor_contact():
    student = SimpleNamespace(id=10, role="STUDENT")
    request = SimpleNamespace(student_account_id=10, tutor_id=20, status="SENT")

    assert _can_view_tutor_contact(student, request) is False


@pytest.mark.parametrize("request_status", sorted(CONTACT_VISIBLE_STATUSES))
def test_confirmed_tutor_can_view_assigned_student_contact(request_status: str):
    tutor = SimpleNamespace(role="TUTOR", tutor_profile=SimpleNamespace(id=20))
    request = SimpleNamespace(
        student_account_id=10,
        tutor_id=20,
        status=request_status,
    )

    assert _can_view_student_contact(tutor, request) is True


def test_pending_or_unassigned_tutor_cannot_view_student_contact():
    tutor = SimpleNamespace(role="TUTOR", tutor_profile=SimpleNamespace(id=20))
    pending_request = SimpleNamespace(student_account_id=10, tutor_id=20, status="SENT")
    other_request = SimpleNamespace(student_account_id=10, tutor_id=21, status="ONGOING")

    assert _can_view_student_contact(tutor, pending_request) is False
    assert _can_view_student_contact(tutor, other_request) is False


def test_staff_can_view_both_contacts_for_operations():
    staff = SimpleNamespace(role="STAFF")
    request = SimpleNamespace(student_account_id=10, tutor_id=20, status="SENT")

    assert _can_view_tutor_contact(staff, request) is True
    assert _can_view_student_contact(staff, request) is True