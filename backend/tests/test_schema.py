"""ERD(docs/backend/ERD.md)와 모델이 어긋나지 않는지, MySQL DDL로 변환되는지 확인한다."""

import datetime as dt

import pytest
from sqlalchemy import insert
from sqlalchemy.dialects import mysql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateTable

import app.models  # noqa: F401  모든 테이블 등록
from app.db.base import Base
from app.models import Reservation, ReservationSlot
from tests.support import make_user, make_workspace

EXPECTED_TABLES = {
    "users",
    "workspaces",
    "workspace_members",
    "workspace_applications",
    "chat_rooms",
    "chat_room_members",
    "messages",
    "tag_groups",
    "tags",
    "chat_room_tags",
    "documents",
    "document_versions",
    "events",
    "event_assignees",
    "reservations",
    "reservation_slots",
    "survey_results",
    "audit_logs",
}


def test_all_tables_registered():
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_mysql_ddl_compiles():
    dialect = mysql.dialect()
    for table in Base.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=dialect))
        assert ddl.startswith("\nCREATE TABLE") or ddl.lstrip().startswith("CREATE TABLE")
    users = str(CreateTable(Base.metadata.tables["users"]).compile(dialect=dialect))
    assert "ENUM('officer','member')" in users


def test_reservation_slot_primary_key_blocks_double_booking():
    slots = Base.metadata.tables["reservation_slots"]
    assert [c.name for c in slots.primary_key.columns] == ["date", "slot"]


def test_overlapping_reservation_slots_are_rejected_by_db(db):
    """예약 API(WBS 7.1)가 기대는 DB 제약: 같은 날짜·슬롯은 한 예약만 차지할 수 있다."""
    owner = make_user(db, "owner")
    ws = make_workspace(db, "예약 테스트", leader=owner, members=[owner])
    day = dt.date(2026, 11, 2)

    def reserve(start: int, end: int) -> None:
        res = Reservation(
            workspace_id=ws.id, owner_id=owner.id, date=day, start_minute=start, end_minute=end, purpose="회의"
        )
        db.add(res)
        db.flush()
        slots = [{"date": day, "slot": (m - 540) // 30, "reservation_id": res.id} for m in range(start, end, 30)]
        db.execute(insert(ReservationSlot), slots)  # 같은 (날짜, 슬롯)이 이미 있으면 DB가 거부
        db.commit()

    reserve(600, 660)  # 10:00~11:00
    reserve(660, 720)  # 11:00~12:00 — 끝과 시작이 맞닿는 연속 예약은 허용
    with pytest.raises(IntegrityError):
        reserve(630, 690)  # 10:30~11:30 — 겹침
    db.rollback()
