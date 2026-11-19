"""통합 캘린더 일정(Event) 요청·응답 스키마."""

import datetime as dt
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import CamelModel, UTCDateTime

Visibility = Literal["club", "workspace", "private"]  # 동아리 전체 / 활동 구성원 / 담당자 본인
EventStatus = Literal["예정", "진행 중", "완료", "보류"]


class EventCreate(CamelModel):
    """일정 등록. club 은 workspaceId 를 비워야 하고, workspace·private 은 반드시 있어야 한다."""

    workspace_id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    start_date: dt.date
    end_date: dt.date
    start_time: dt.time
    end_time: dt.time
    visibility: Visibility = "workspace"
    status: EventStatus = "예정"
    work: str = ""
    assignee_ids: list[int] = []

    @model_validator(mode="after")
    def check(self) -> "EventCreate":
        if self.start_date > self.end_date:
            raise ValueError("시작일이 종료일보다 늦을 수 없음")
        if self.start_date == self.end_date and self.start_time >= self.end_time:
            raise ValueError("같은 날이면 시작 시각이 종료 시각보다 빨라야 함")
        if self.visibility == "club" and self.workspace_id is not None:
            raise ValueError("동아리 전체 일정에는 활동을 지정할 수 없음")
        if self.visibility != "club" and self.workspace_id is None:
            raise ValueError("활동·개인 일정에는 활동을 지정해야 함")
        return self


class EventUpdate(CamelModel):
    """일정 수정. 보낸 항목만 바꾼다. 공개 범위와 소속 활동은 바꾸지 않는다."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: dt.date | None = None
    end_date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    status: EventStatus | None = None
    work: str | None = None
    assignee_ids: list[int] | None = None


class EventOut(CamelModel):
    """일정 응답."""

    id: int
    workspace_id: int | None
    title: str
    start_date: dt.date
    end_date: dt.date
    start_time: dt.time
    end_time: dt.time
    visibility: Visibility
    status: EventStatus
    work: str
    assignee_ids: list[int]
    created_by: int
    can_edit: bool
    updated_at: UTCDateTime


class CalendarReservationOut(CamelModel):
    """캘린더에 함께 표시하는 예약. 시간은 자정 기준 분."""

    id: int
    workspace_id: int
    workspace_name: str
    owner_id: int
    date: dt.date
    start_minute: int
    end_minute: int
    purpose: str | None


class CalendarOut(CamelModel):
    """일정과 예약을 한 번에 돌려준다. 화면이 두 번 요청하지 않아도 되게 하기 위함이다."""

    events: list[EventOut]
    reservations: list[CalendarReservationOut]
