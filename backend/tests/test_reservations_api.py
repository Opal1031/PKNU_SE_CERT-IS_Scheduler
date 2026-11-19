"""동아리방 예약 조회·신청·변경·취소 테스트 (WBS 7.1)."""

import pytest
from sqlalchemy import select

from app.models import ReservationSlot
from tests.support import login, make_workspace

DATE = "2026-12-01"
# 09:00=540, 30분 단위
TEN, ELEVEN, TWELVE = 600, 660, 720


@pytest.fixture()
def ws(db, people):
    return make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])


@pytest.fixture()
def other_ws(db, people):
    return make_workspace(db, "다른 활동", people["carol"], [people["carol"]])


def book(client, ws_id, head, start=TEN, end=ELEVEN, date=DATE, purpose="스터디"):
    return client.post(
        "/api/reservations",
        json={"workspaceId": ws_id, "date": date, "startMinute": start, "endMinute": end, "purpose": purpose},
        headers=head,
    )


# --- 신청 ---------------------------------------------------------------


def test_member_can_book(client, people, ws):
    res = book(client, ws.id, login(client, "alice"))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["startMinute"] == TEN and body["status"] == "확정" and body["purpose"] == "스터디"


def test_non_member_cannot_book(client, people, ws):
    res = book(client, ws.id, login(client, "carol"))
    assert res.status_code == 403


def test_officer_can_book_for_any_workspace(client, people, ws):
    """임원진은 운영 목적으로 어느 활동 이름으로든 예약할 수 있다."""
    assert book(client, ws.id, login(client, "officer")).status_code == 201


def test_booking_occupies_one_slot_row_per_30_minutes(client, people, ws, db):
    book(client, ws.id, login(client, "alice"), start=TEN, end=TWELVE)  # 2시간
    slots = sorted(db.scalars(select(ReservationSlot.slot)))
    assert slots == [20, 21, 22, 23]  # 10:00~12:00 → 30분 슬롯 4칸


# --- 중복 방지 ----------------------------------------------------------


def test_exact_overlap_is_rejected(client, people, ws, other_ws):
    book(client, ws.id, login(client, "alice"))
    res = book(client, other_ws.id, login(client, "carol"))
    assert res.status_code == 409


def test_partial_overlap_is_rejected(client, people, ws, other_ws):
    book(client, ws.id, login(client, "alice"), start=TEN, end=TWELVE)
    res = book(client, other_ws.id, login(client, "carol"), start=ELEVEN, end=TWELVE)
    assert res.status_code == 409


def test_adjacent_booking_is_allowed(client, people, ws, other_ws):
    """끝나는 시각과 시작 시각이 같은 예약은 겹치지 않는다."""
    book(client, ws.id, login(client, "alice"), start=TEN, end=ELEVEN)
    res = book(client, other_ws.id, login(client, "carol"), start=ELEVEN, end=TWELVE)
    assert res.status_code == 201


def test_same_time_on_another_day_is_allowed(client, people, ws, other_ws):
    book(client, ws.id, login(client, "alice"))
    res = book(client, other_ws.id, login(client, "carol"), date="2026-12-02")
    assert res.status_code == 201


def test_rejected_booking_leaves_no_slots_behind(client, people, ws, other_ws, db):
    """409로 거부된 예약이 슬롯을 일부라도 남기면 그 시간이 영영 막힌다."""
    book(client, ws.id, login(client, "alice"), start=ELEVEN, end=TWELVE)
    book(client, other_ws.id, login(client, "carol"), start=TEN, end=TWELVE)  # 409
    slots = sorted(db.scalars(select(ReservationSlot.slot)))
    assert slots == [22, 23]  # 성공한 11:00~12:00 것만 남음


# --- 입력 검증 ----------------------------------------------------------


@pytest.mark.parametrize(
    ("start", "end"),
    [(ELEVEN, TEN), (TEN, TEN), (480, ELEVEN), (TEN, 1500), (TEN + 10, ELEVEN)],
    ids=["역전", "같음", "개방 전", "마감 후", "30분 단위 아님"],
)
def test_invalid_time_is_rejected(client, people, ws, start, end):
    assert book(client, ws.id, login(client, "alice"), start=start, end=end).status_code == 422


# --- 목적 가리기 --------------------------------------------------------


def test_other_teams_purpose_is_hidden(client, people, ws, other_ws):
    book(client, ws.id, login(client, "alice"), purpose="비밀 회의")
    res = client.get(f"/api/reservations?from={DATE}&to={DATE}", headers=login(client, "carol"))
    assert res.status_code == 200
    row = res.json()[0]
    assert row["purpose"] is None  # 시간·활동은 보이지만 목적은 가려짐
    assert row["workspaceName"] == "활동" and row["startMinute"] == TEN
    assert row["canEdit"] is False


def test_own_team_sees_purpose(client, people, ws):
    book(client, ws.id, login(client, "alice"), purpose="비밀 회의")
    res = client.get(f"/api/reservations?from={DATE}&to={DATE}", headers=login(client, "bob"))
    assert res.json()[0]["purpose"] == "비밀 회의"


def test_officer_sees_purpose(client, people, ws):
    book(client, ws.id, login(client, "alice"), purpose="비밀 회의")
    res = client.get(f"/api/reservations?from={DATE}&to={DATE}", headers=login(client, "officer"))
    assert res.json()[0]["purpose"] == "비밀 회의"


# --- 변경 ---------------------------------------------------------------


def test_owner_can_move_booking(client, people, ws, db):
    rid = book(client, ws.id, login(client, "alice")).json()["id"]
    res = client.patch(
        f"/api/reservations/{rid}", json={"startMinute": ELEVEN, "endMinute": TWELVE}, headers=login(client, "alice")
    )
    assert res.status_code == 200
    assert res.json()["startMinute"] == ELEVEN
    assert sorted(db.scalars(select(ReservationSlot.slot))) == [22, 23]  # 이전 슬롯 해제됨


def test_leader_can_edit_members_booking(client, people, ws):
    rid = book(client, ws.id, login(client, "bob")).json()["id"]
    res = client.patch(f"/api/reservations/{rid}", json={"purpose": "변경"}, headers=login(client, "alice"))
    assert res.status_code == 200


def test_other_member_cannot_edit(client, people, ws, other_ws):
    rid = book(client, ws.id, login(client, "alice")).json()["id"]
    res = client.patch(f"/api/reservations/{rid}", json={"purpose": "변경"}, headers=login(client, "carol"))
    assert res.status_code == 403


def test_move_into_taken_time_is_rejected(client, people, ws, other_ws):
    rid = book(client, ws.id, login(client, "alice"), start=TEN, end=ELEVEN).json()["id"]
    book(client, other_ws.id, login(client, "carol"), start=ELEVEN, end=TWELVE)
    res = client.patch(
        f"/api/reservations/{rid}", json={"startMinute": ELEVEN, "endMinute": TWELVE}, headers=login(client, "alice")
    )
    assert res.status_code == 409


# --- 취소 ---------------------------------------------------------------


def test_cancel_frees_the_time_but_keeps_the_record(client, people, ws, other_ws, db):
    rid = book(client, ws.id, login(client, "alice")).json()["id"]
    res = client.post(f"/api/reservations/{rid}/cancel", json={"reason": "일정 변경"}, headers=login(client, "alice"))
    assert res.status_code == 200
    assert res.json()["status"] == "취소" and res.json()["cancelReason"] == "일정 변경"
    assert db.scalar(select(ReservationSlot.slot)) is None  # 시간은 해제
    # 같은 시간을 다른 팀이 예약할 수 있다
    assert book(client, other_ws.id, login(client, "carol")).status_code == 201


def test_cancelled_booking_is_hidden_by_default(client, people, ws):
    rid = book(client, ws.id, login(client, "alice")).json()["id"]
    client.post(f"/api/reservations/{rid}/cancel", json={"reason": "x"}, headers=login(client, "alice"))
    head = login(client, "alice")
    assert client.get(f"/api/reservations?from={DATE}&to={DATE}", headers=head).json() == []
    with_cancelled = client.get(
        f"/api/reservations?from={DATE}&to={DATE}&includeCancelled=true", headers=head
    ).json()
    assert len(with_cancelled) == 1 and with_cancelled[0]["status"] == "취소"


def test_cannot_cancel_twice(client, people, ws):
    rid = book(client, ws.id, login(client, "alice")).json()["id"]
    head = login(client, "alice")
    client.post(f"/api/reservations/{rid}/cancel", json={"reason": "x"}, headers=head)
    res = client.post(f"/api/reservations/{rid}/cancel", json={"reason": "y"}, headers=head)
    assert res.status_code == 400


def test_cannot_edit_cancelled_booking(client, people, ws):
    rid = book(client, ws.id, login(client, "alice")).json()["id"]
    head = login(client, "alice")
    client.post(f"/api/reservations/{rid}/cancel", json={"reason": "x"}, headers=head)
    assert client.patch(f"/api/reservations/{rid}", json={"purpose": "z"}, headers=head).status_code == 400


def test_unknown_reservation_returns_404(client, people):
    res = client.post("/api/reservations/9999/cancel", json={"reason": "x"}, headers=login(client, "alice"))
    assert res.status_code == 404
