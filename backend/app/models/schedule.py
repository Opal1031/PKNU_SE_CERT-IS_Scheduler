"""통합 캘린더 일정과 동아리방 예약."""

import datetime as dt

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, SmallInteger, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

EVENT_VISIBILITIES = ("club", "workspace", "private")  # 동아리 전체 / 활동 구성원 / 담당자 본인
EVENT_STATUSES = ("예정", "진행 중", "완료", "보류")
RESERVATION_STATUSES = ("확정", "취소")

# 동아리방 운영 시간: 09:00~24:00, 30분 단위 → 슬롯 0(09:00)~29(23:30)
OPEN_MINUTE, CLOSE_MINUTE, SLOT_MINUTES = 9 * 60, 24 * 60, 30


class Event(TimestampMixin, Base):
    """workspace_id가 NULL이면 임원진이 등록하는 동아리 전체 일정(visibility='club')이다.

    'club ↔ workspace_id NULL' 규칙은 API에서 검사한다. MySQL은 ON DELETE 동작이 걸린
    외래 키 컬럼(workspace_id)을 CHECK 제약에 쓸 수 없기 때문이다.
    """

    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="period"),
        Index("ix_events_start_date_end_date", "start_date", "end_date"),  # 월간 캘린더 기간 조회
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    start_date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date] = mapped_column(Date)
    start_time: Mapped[dt.time] = mapped_column(Time)
    end_time: Mapped[dt.time] = mapped_column(Time)
    visibility: Mapped[str] = mapped_column(Enum(*EVENT_VISIBILITIES, name="event_visibility"), default="workspace")
    status: Mapped[str] = mapped_column(Enum(*EVENT_STATUSES, name="event_status"), default="예정")
    work: Mapped[str] = mapped_column(Text, default="")  # 담당 업무 설명
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deleted_at: Mapped[dt.datetime | None] = mapped_column(DateTime)  # 삭제 시 기록을 남기는 소프트 삭제


class EventAssignee(Base):
    """일정 담당자(일정 ↔ 사용자 다대다). 개인 일정은 담당자에게만 보인다."""

    __tablename__ = "event_assignees"

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class Reservation(TimestampMixin, Base):
    """동아리방 예약. 시간은 자정 기준 분(540=09:00, 1440=24:00)으로 저장한다.

    24:00 종료는 DB TIME·파이썬 time으로 표현이 애매해 분 단위 정수를 쓴다.
    취소해도 행은 남겨 취소 기록을 보여 주고, 시간 점유는 reservation_slots에서 해제한다.
    """

    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(
            f"start_minute >= {OPEN_MINUTE} AND end_minute <= {CLOSE_MINUTE} AND start_minute < end_minute",
            name="time_range",
        ),
        Index("ix_reservations_date", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date: Mapped[dt.date] = mapped_column(Date)
    start_minute: Mapped[int] = mapped_column(SmallInteger)
    end_minute: Mapped[int] = mapped_column(SmallInteger)
    purpose: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(Enum(*RESERVATION_STATUSES, name="reservation_status"), default="확정")
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class ReservationSlot(Base):
    """(날짜, 30분 슬롯)을 기본키로 두어 같은 시간에 두 예약이 들어가는 것을 DB가 막는다.

    예약 생성 시 같은 트랜잭션에서 슬롯 행을 함께 넣고, 동시에 같은 슬롯을 넣으려는
    요청은 기본키 중복 오류로 실패하므로 한 건만 확정된다. (WBS 7.1: UNIQUE 제약 + 트랜잭션)
    """

    __tablename__ = "reservation_slots"

    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    slot: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id", ondelete="CASCADE"), index=True)
