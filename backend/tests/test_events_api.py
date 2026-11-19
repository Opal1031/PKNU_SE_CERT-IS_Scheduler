"""통합 캘린더: 일정 CRUD와 일정+예약 합본 조회 테스트."""

import pytest

from app.models import Event
from tests.support import login, make_workspace

FROM, TO = "2026-12-01", "2026-12-31"
BASE = {"startDate": "2026-12-10", "endDate": "2026-12-10", "startTime": "10:00:00", "endTime": "12:00:00"}


@pytest.fixture()
def ws(db, people):
    return make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])


def add_event(client, head, **over):
    return client.post("/api/events", json={**BASE, "title": "일정", **over}, headers=head)


def cal(client, head, query=""):
    res = client.get(f"/api/calendar?from={FROM}&to={TO}{query}", headers=head)
    assert res.status_code == 200, res.text
    return res.json()


# --- 등록 권한 ----------------------------------------------------------


def test_member_can_add_workspace_event(client, people, ws):
    res = add_event(client, login(client, "alice"), workspaceId=ws.id)
    assert res.status_code == 201, res.text
    assert res.json()["visibility"] == "workspace" and res.json()["canEdit"] is True


def test_non_member_cannot_add_workspace_event(client, people, ws):
    assert add_event(client, login(client, "carol"), workspaceId=ws.id).status_code == 403


def test_only_officer_can_add_club_event(client, people):
    assert add_event(client, login(client, "officer"), visibility="club").status_code == 201
    assert add_event(client, login(client, "alice"), visibility="club").status_code == 403


def test_club_event_must_not_have_workspace(client, people, ws):
    res = add_event(client, login(client, "officer"), visibility="club", workspaceId=ws.id)
    assert res.status_code == 422


def test_workspace_event_requires_workspace(client, people):
    assert add_event(client, login(client, "alice")).status_code == 422


@pytest.mark.parametrize(
    "over",
    [
        {"startDate": "2026-12-11", "endDate": "2026-12-10"},
        {"startTime": "12:00:00", "endTime": "10:00:00"},
    ],
    ids=["날짜 역전", "같은 날 시각 역전"],
)
def test_reversed_period_is_rejected(client, people, ws, over):
    assert add_event(client, login(client, "alice"), workspaceId=ws.id, **over).status_code == 422


def test_unknown_assignee_is_rejected(client, people, ws):
    res = add_event(client, login(client, "alice"), workspaceId=ws.id, assigneeIds=[9999])
    assert res.status_code == 400


# --- 조회 범위 ----------------------------------------------------------


def test_club_event_is_visible_to_everyone(client, people):
    add_event(client, login(client, "officer"), visibility="club")
    assert len(cal(client, login(client, "carol"))["events"]) == 1


def test_workspace_event_hidden_from_non_member(client, people, ws):
    add_event(client, login(client, "alice"), workspaceId=ws.id)
    assert cal(client, login(client, "carol"))["events"] == []
    assert len(cal(client, login(client, "bob"))["events"]) == 1


def test_officer_sees_workspace_event_without_joining(client, people, ws):
    """임원진은 운영 조회 권한으로 활동 일정을 본다(회의록·대화와 달리 공개)."""
    add_event(client, login(client, "alice"), workspaceId=ws.id)
    events = cal(client, login(client, "officer"))["events"]
    assert len(events) == 1 and events[0]["canEdit"] is False  # 보되 수정은 못 함


def test_private_event_visible_only_to_assignee(client, people, ws):
    add_event(
        client, login(client, "alice"), workspaceId=ws.id, visibility="private", assigneeIds=[people["alice"].id]
    )
    assert len(cal(client, login(client, "alice"))["events"]) == 1
    assert cal(client, login(client, "bob"))["events"] == []
    assert cal(client, login(client, "officer"))["events"] == []


def test_private_event_defaults_assignee_to_creator(client, people, ws):
    """담당자를 비우면 등록자가 담당자가 된다. 아무에게도 안 보이는 일정이 생기지 않게."""
    res = add_event(client, login(client, "alice"), workspaceId=ws.id, visibility="private")
    assert res.json()["assigneeIds"] == [people["alice"].id]
    assert len(cal(client, login(client, "alice"))["events"]) == 1


# --- 기간·필터 ----------------------------------------------------------


def test_event_spanning_the_range_is_included(client, people, ws):
    """기간을 가로지르는 일정도 걸린다(11월 말 ~ 12월 초)."""
    add_event(client, login(client, "alice"), workspaceId=ws.id, startDate="2026-11-28", endDate="2026-12-02")
    assert len(cal(client, login(client, "alice"))["events"]) == 1


def test_event_outside_the_range_is_excluded(client, people, ws):
    add_event(client, login(client, "alice"), workspaceId=ws.id, startDate="2027-01-05", endDate="2027-01-05")
    assert cal(client, login(client, "alice"))["events"] == []


def test_workspace_filter(client, people, ws, db):
    other = make_workspace(db, "다른 활동", people["alice"], [people["alice"]])
    add_event(client, login(client, "alice"), workspaceId=ws.id)
    add_event(client, login(client, "alice"), workspaceId=other.id)
    assert len(cal(client, login(client, "alice"), f"&workspaceId={ws.id}")["events"]) == 1


def test_mine_filter_keeps_only_my_events(client, people, ws):
    add_event(client, login(client, "alice"), workspaceId=ws.id, title="앨리스 것")
    add_event(client, login(client, "bob"), workspaceId=ws.id, title="밥 것")
    mine = cal(client, login(client, "alice"), "&mine=true")["events"]
    assert [e["title"] for e in mine] == ["앨리스 것"]


# --- 수정·삭제 ----------------------------------------------------------


def test_member_can_update_and_replace_assignees(client, people, ws):
    head = login(client, "alice")
    eid = add_event(client, head, workspaceId=ws.id).json()["id"]
    res = client.patch(
        f"/api/events/{eid}", json={"status": "완료", "assigneeIds": [people["bob"].id]}, headers=head
    )
    assert res.status_code == 200
    assert res.json()["status"] == "완료" and res.json()["assigneeIds"] == [people["bob"].id]


def test_non_member_cannot_update(client, people, ws):
    eid = add_event(client, login(client, "alice"), workspaceId=ws.id).json()["id"]
    res = client.patch(f"/api/events/{eid}", json={"status": "완료"}, headers=login(client, "carol"))
    assert res.status_code == 403


def test_update_rejects_reversed_period(client, people, ws):
    head = login(client, "alice")
    eid = add_event(client, head, workspaceId=ws.id).json()["id"]
    res = client.patch(f"/api/events/{eid}", json={"endDate": "2026-12-09"}, headers=head)
    assert res.status_code == 400


def test_delete_hides_event_but_keeps_the_row(client, people, ws, db):
    head = login(client, "alice")
    eid = add_event(client, head, workspaceId=ws.id).json()["id"]
    assert client.delete(f"/api/events/{eid}", headers=head).status_code == 204
    assert cal(client, head)["events"] == []
    row = db.get(Event, eid)
    db.refresh(row)
    assert row is not None and row.deleted_at is not None  # 기록은 남는다


def test_deleted_event_cannot_be_updated_or_deleted_again(client, people, ws):
    head = login(client, "alice")
    eid = add_event(client, head, workspaceId=ws.id).json()["id"]
    client.delete(f"/api/events/{eid}", headers=head)
    assert client.patch(f"/api/events/{eid}", json={"status": "완료"}, headers=head).status_code == 404
    assert client.delete(f"/api/events/{eid}", headers=head).status_code == 404


def test_only_officer_can_delete_club_event(client, people):
    eid = add_event(client, login(client, "officer"), visibility="club").json()["id"]
    assert client.delete(f"/api/events/{eid}", headers=login(client, "alice")).status_code == 403
    assert client.delete(f"/api/events/{eid}", headers=login(client, "officer")).status_code == 204


# --- 예약 합본 ----------------------------------------------------------


def test_calendar_includes_reservations(client, people, ws):
    head = login(client, "alice")
    client.post(
        "/api/reservations",
        json={"workspaceId": ws.id, "date": "2026-12-10", "startMinute": 600, "endMinute": 660, "purpose": "스터디"},
        headers=head,
    )
    data = cal(client, head)
    assert len(data["reservations"]) == 1
    assert data["reservations"][0]["purpose"] == "스터디"


def test_other_teams_reservation_purpose_is_hidden_in_calendar(client, people, ws):
    client.post(
        "/api/reservations",
        json={"workspaceId": ws.id, "date": "2026-12-10", "startMinute": 600, "endMinute": 660, "purpose": "비밀"},
        headers=login(client, "alice"),
    )
    row = cal(client, login(client, "carol"))["reservations"][0]
    assert row["purpose"] is None and row["workspaceName"] == "활동"


def test_cancelled_reservation_is_not_on_calendar(client, people, ws):
    head = login(client, "alice")
    rid = client.post(
        "/api/reservations",
        json={"workspaceId": ws.id, "date": "2026-12-10", "startMinute": 600, "endMinute": 660, "purpose": "x"},
        headers=head,
    ).json()["id"]
    client.post(f"/api/reservations/{rid}/cancel", json={"reason": "변경"}, headers=head)
    assert cal(client, head)["reservations"] == []
