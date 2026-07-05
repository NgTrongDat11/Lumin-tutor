"""MessageThread model — maps to message_threads table."""

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MessageThread(Base, TimestampMixin):
    __tablename__ = "message_threads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    private_request_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("private_tutoring_requests.id")
    )
    class_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("course_classes.id"))
    class_registration_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("class_registrations.id")
    )
    title: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="OPEN")
