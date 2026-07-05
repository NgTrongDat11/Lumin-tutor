"""Schemas for learning needs."""

from datetime import time
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, Field, model_validator


class LearningNeedScheduleCreate(BaseModel):
    day_of_week: int = Field(ge=1, le=7)
    start_time: time | None = None
    end_time: time | None = None
    time_slot: str | None = None  # MORNING, AFTERNOON, EVENING

    @model_validator(mode="after")
    def validate_schedule_times(self) -> Self:
        if self.time_slot is not None:
            if self.time_slot not in ("MORNING", "AFTERNOON", "EVENING"):
                raise ValueError("time_slot must be MORNING, AFTERNOON, or EVENING")
            if self.start_time is not None or self.end_time is not None:
                raise ValueError("Cannot specify start_time/end_time when time_slot is provided")
        else:
            if self.start_time is None or self.end_time is None:
                raise ValueError("Must specify either time_slot OR both start_time and end_time")
            if self.start_time >= self.end_time:
                raise ValueError("start_time must be before end_time")
        return self


class LearningNeedCreate(BaseModel):
    subject_id: int | None = None
    grade_level: str | None = None
    goal: str | None = None
    budget_per_session_min: Decimal | None = None
    budget_per_session_max: Decimal | None = None
    preferred_mode: str = "BOTH"
    preferred_learning_type: str = "BOTH"
    preferred_area: str | None = None
    raw_text: str | None = None
    schedules: list[LearningNeedScheduleCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_learning_need(self) -> Self:
        if self.preferred_mode not in ("ONLINE", "OFFLINE", "BOTH"):
            raise ValueError("preferred_mode must be ONLINE, OFFLINE, or BOTH")
        if self.preferred_learning_type not in ("PRIVATE", "GROUP", "BOTH"):
            raise ValueError("preferred_learning_type must be PRIVATE, GROUP, or BOTH")

        if self.budget_per_session_min is not None and self.budget_per_session_min <= 0:
            raise ValueError("budget_per_session_min must be positive")
        if self.budget_per_session_max is not None and self.budget_per_session_max <= 0:
            raise ValueError("budget_per_session_max must be positive")
        if (
            self.budget_per_session_min is not None
            and self.budget_per_session_max is not None
            and self.budget_per_session_min > self.budget_per_session_max
        ):
            raise ValueError("budget_per_session_min cannot be greater than budget_per_session_max")

        # Check duplicate and overlapping schedules
        for i, s1 in enumerate(self.schedules):
            for j, s2 in enumerate(self.schedules[i + 1 :], start=i + 1):
                if s1.day_of_week == s2.day_of_week:
                    if s1.time_slot == "MORNING":
                        t1_start, t1_end = time(7, 0), time(12, 0)
                    elif s1.time_slot == "AFTERNOON":
                        t1_start, t1_end = time(13, 0), time(17, 0)
                    elif s1.time_slot == "EVENING":
                        t1_start, t1_end = time(18, 0), time(21, 0)
                    else:
                        t1_start, t1_end = s1.start_time, s1.end_time

                    if s2.time_slot == "MORNING":
                        t2_start, t2_end = time(7, 0), time(12, 0)
                    elif s2.time_slot == "AFTERNOON":
                        t2_start, t2_end = time(13, 0), time(17, 0)
                    elif s2.time_slot == "EVENING":
                        t2_start, t2_end = time(18, 0), time(21, 0)
                    else:
                        t2_start, t2_end = s2.start_time, s2.end_time

                    if t1_start is not None and t1_end is not None and t2_start is not None and t2_end is not None:
                        if t1_start < t2_end and t2_start < t1_end:
                            s1_str = s1.time_slot if s1.time_slot else f"{s1.start_time.strftime('%H:%M')}-{s1.end_time.strftime('%H:%M')}"
                            s2_str = s2.time_slot if s2.time_slot else f"{s2.start_time.strftime('%H:%M')}-{s2.end_time.strftime('%H:%M')}"
                            raise ValueError(
                                f"Overlapping schedule detected for day {s1.day_of_week}: "
                                f"{s1_str} and {s2_str}"
                            )

        seen = set()
        for s in self.schedules:
            key = (s.day_of_week, s.time_slot, s.start_time, s.end_time)
            if key in seen:
                raise ValueError(f"Duplicate schedule entry detected for day {s.day_of_week}")
            seen.add(key)

        return self


class LearningNeedUpdate(LearningNeedCreate):
    pass


class LearningNeedScheduleResponse(BaseModel):
    id: int
    day_of_week: int
    start_time: time | None
    end_time: time | None
    time_slot: str | None

    model_config = {"from_attributes": True}


class LearningNeedResponse(BaseModel):
    id: int
    student_account_id: int
    subject_id: int | None
    grade_level: str | None
    goal: str | None
    budget_per_session_min: Decimal | None
    budget_per_session_max: Decimal | None
    preferred_mode: str
    preferred_learning_type: str
    preferred_area: str | None
    raw_text: str | None
    parsed_data: str | None
    parser_source: str
    parsed_confidence: Decimal | None
    status: str
    schedules: list[LearningNeedScheduleResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
