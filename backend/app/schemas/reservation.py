"""동아리방 예약 요청·응답 스키마 (WBS 7.1).

시간은 모델과 같은 '자정 기준 분'(540=09:00, 1440=24:00)으로 주고받는다.
24:00 종료를 표현하기 위해서다. 화면은 분을 HH:MM으로 바꿔 보여 준다.
"""

import datetime as dt
from typing import Literal

from pydantic import Field, model_validator

from app.models.schedule import CLOSE_MINUTE, OPEN_MINUTE, SLOT_MINUTES
from app.schemas.common import CamelModel, UTCDateTime


def _check_range(start: int, end: int) -> None:
    """운영 시간(09:00~24:00) 안이고 30분 단위이며 시작 < 종료인지 확인한다."""
    if start >= end:
        raise ValueError("시작 시각이 종료 시각보다 빠를 수 없음")
    if start < OPEN_MINUTE or end > CLOSE_MINUTE:
        raise ValueError("동아리방 운영 시간(09:00~24:00) 안이어야 함")
    if start % SLOT_MINUTES or end % SLOT_MINUTES:
        raise ValueError("예약은 30분 단위로만 가능함")


class ReservationCreate(CamelModel):
    """예약 신청. 시간이 이미 점유돼 있으면 409."""

    workspace_id: int
    date: dt.date
    start_minute: int = Field(description="자정 기준 분. 09:00=540")
    end_minute: int = Field(description="자정 기준 분. 24:00=1440")
    purpose: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def check(self) -> "ReservationCreate":
        _check_range(self.start_minute, self.end_minute)
        return self


class ReservationUpdate(CamelModel):
    """예약 시간·목적 변경. 시간을 바꾸면 슬롯을 다시 점유하며 겹치면 409."""

    date: dt.date | None = None
    start_minute: int | None = None
    end_minute: int | None = None
    purpose: str | None = Field(default=None, min_length=1, max_length=200)


class ReservationCancel(CamelModel):
    """예약 취소. 기록을 남기기 위해 사유를 받는다."""

    reason: str = Field(min_length=1, max_length=200)


class ReservationOut(CamelModel):
    """예약 응답.

    purpose 는 그 활동의 구성원·임원진에게만 보인다. 다른 팀 예약은 '언제 누가 쓰는지'만
    알면 충분하고 사용 목적까지 공개할 이유가 없어 None 으로 가린다.
    """

    id: int
    workspace_id: int
    workspace_name: str
    owner_id: int
    date: dt.date
    start_minute: int
    end_minute: int
    purpose: str | None
    status: Literal["확정", "취소"]
    cancel_reason: str | None
    can_edit: bool
    updated_at: UTCDateTime
