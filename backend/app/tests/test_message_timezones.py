from datetime import datetime, timezone

from app.schemas.message import MessageResponse, MessageThreadResponse


def test_message_response_serializes_naive_datetime_as_utc_z():
    payload = MessageResponse(
        id=1,
        thread_id=2,
        sender_id=3,
        content="hiii",
        created_at=datetime(2026, 6, 24, 18, 42),
    ).model_dump(mode="json")

    assert payload["created_at"] == "2026-06-24T18:42:00Z"


def test_message_thread_response_serializes_aware_datetime_as_utc_z():
    payload = MessageThreadResponse(
        id=1,
        title="Test thread",
        status="OPEN",
        created_at=datetime(2026, 6, 25, 1, 42, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 25, 1, 43, tzinfo=timezone.utc),
    ).model_dump(mode="json")

    assert payload["created_at"] == "2026-06-25T01:42:00Z"
    assert payload["updated_at"] == "2026-06-25T01:43:00Z"
