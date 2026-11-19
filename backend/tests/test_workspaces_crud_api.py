"""활동 등록·수정·구성원 관리·참가 신청·필터 조회 테스트 (WBS 5.1)."""

from sqlalchemy import select

from app.models import ChatRoom, ChatRoomMember, WorkspaceApplication
from tests.support import login, make_workspace

NEW = {"type": "project", "name": "새 프로젝트", "initial": "NP", "field": "웹 보안", "goal": "목표"}


# --- 등록 ---------------------------------------------------------------


def test_create_makes_creator_the_leader_and_member(client, people, db):
    head = login(client, "alice")
    res = client.post("/api/workspaces", json=NEW, headers=head)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["leaderId"] == people["alice"].id
    assert body["memberIds"] == [people["alice"].id]
    assert body["myRole"] == "leader"


def test_create_adds_given_members_without_duplicating_creator(client, people):
    head = login(client, "alice")
    ids = [people["alice"].id, people["bob"].id]
    res = client.post("/api/workspaces", json={**NEW, "memberIds": ids}, headers=head)
    assert res.json()["memberIds"] == ids


def test_create_also_creates_default_chat_room_with_all_members(client, people, db):
    head = login(client, "alice")
    res = client.post("/api/workspaces", json={**NEW, "memberIds": [people["bob"].id]}, headers=head)
    ws_id = res.json()["id"]
    room = db.scalar(select(ChatRoom).where(ChatRoom.workspace_id == ws_id))
    assert room is not None and room.name == "일반"
    member_ids = set(db.scalars(select(ChatRoomMember.user_id).where(ChatRoomMember.room_id == room.id)))
    assert member_ids == {people["alice"].id, people["bob"].id}


def test_create_rejects_unknown_member(client, people):
    head = login(client, "alice")
    res = client.post("/api/workspaces", json={**NEW, "memberIds": [9999]}, headers=head)
    assert res.status_code == 400


def test_create_rejects_reversed_period(client, people):
    head = login(client, "alice")
    res = client.post("/api/workspaces", json={**NEW, "startDate": "2026-12-01", "endDate": "2026-11-01"}, headers=head)
    assert res.status_code == 422


# --- 수정 ---------------------------------------------------------------


def test_leader_can_update_only_sent_fields(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])
    head = login(client, "alice")
    res = client.patch(f"/api/workspaces/{ws.id}", json={"status": "보류"}, headers=head)
    assert res.status_code == 200
    assert res.json()["status"] == "보류"
    assert res.json()["name"] == "활동"  # 보내지 않은 항목은 그대로


def test_member_cannot_update(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])
    res = client.patch(f"/api/workspaces/{ws.id}", json={"status": "보류"}, headers=login(client, "bob"))
    assert res.status_code == 403


def test_update_rejects_reversed_period(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    head = login(client, "alice")
    res = client.patch(
        f"/api/workspaces/{ws.id}", json={"startDate": "2026-12-01", "endDate": "2026-11-01"}, headers=head
    )
    assert res.status_code == 400


# --- 구성원·팀장 위임 ----------------------------------------------------


def test_leader_can_delegate_and_replace_members(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])
    head = login(client, "alice")
    ids = [people["alice"].id, people["bob"].id, people["carol"].id]
    res = client.put(
        f"/api/workspaces/{ws.id}/members", json={"memberIds": ids, "leaderId": people["bob"].id}, headers=head
    )
    assert res.status_code == 200
    assert res.json()["leaderId"] == people["bob"].id
    assert sorted(res.json()["memberIds"]) == sorted(ids)


def test_members_update_requires_leader_inside_member_list(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    head = login(client, "alice")
    res = client.put(
        f"/api/workspaces/{ws.id}/members",
        json={"memberIds": [people["alice"].id], "leaderId": people["bob"].id},
        headers=head,
    )
    assert res.status_code == 400


def test_members_update_rejects_empty_list(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    res = client.put(
        f"/api/workspaces/{ws.id}/members",
        json={"memberIds": [], "leaderId": people["alice"].id},
        headers=login(client, "alice"),
    )
    assert res.status_code == 400


def test_removed_member_also_leaves_chat_rooms(client, people, db):
    head = login(client, "alice")
    ws_id = client.post(
        "/api/workspaces", json={**NEW, "memberIds": [people["bob"].id]}, headers=head
    ).json()["id"]
    client.put(
        f"/api/workspaces/{ws_id}/members",
        json={"memberIds": [people["alice"].id], "leaderId": people["alice"].id},
        headers=head,
    )
    room = db.scalar(select(ChatRoom).where(ChatRoom.workspace_id == ws_id))
    left = set(db.scalars(select(ChatRoomMember.user_id).where(ChatRoomMember.room_id == room.id)))
    assert left == {people["alice"].id}


# --- 나가기 -------------------------------------------------------------


def test_member_can_leave(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])
    res = client.post(f"/api/workspaces/{ws.id}/leave", headers=login(client, "bob"))
    assert res.status_code == 204
    detail = client.get(f"/api/workspaces/{ws.id}", headers=login(client, "alice")).json()
    assert people["bob"].id not in detail["memberIds"]


def test_leader_must_delegate_before_leaving(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])
    res = client.post(f"/api/workspaces/{ws.id}/leave", headers=login(client, "alice"))
    assert res.status_code == 400


def test_non_member_cannot_leave(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    res = client.post(f"/api/workspaces/{ws.id}/leave", headers=login(client, "bob"))
    assert res.status_code == 403


# --- 참가 신청 ----------------------------------------------------------


def test_non_member_can_apply(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    res = client.post(f"/api/workspaces/{ws.id}/applications", headers=login(client, "bob"))
    assert res.status_code == 201
    assert res.json()["status"] == "대기"
    assert db.scalar(select(WorkspaceApplication.user_id)) == people["bob"].id


def test_duplicate_application_returns_409(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    head = login(client, "bob")
    client.post(f"/api/workspaces/{ws.id}/applications", headers=head)
    res = client.post(f"/api/workspaces/{ws.id}/applications", headers=head)
    assert res.status_code == 409


def test_member_cannot_apply(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]])
    res = client.post(f"/api/workspaces/{ws.id}/applications", headers=login(client, "alice"))
    assert res.status_code == 400


def test_cannot_apply_to_finished_workspace(client, people, db):
    ws = make_workspace(db, "활동", people["alice"], [people["alice"]], status="완료")
    res = client.post(f"/api/workspaces/{ws.id}/applications", headers=login(client, "bob"))
    assert res.status_code == 400


# --- 필터 조회 ----------------------------------------------------------


def test_filters_narrow_the_list(client, people, db):
    alice, bob = people["alice"], people["bob"]
    make_workspace(db, "웹 해킹", alice, [alice, bob])
    study = make_workspace(db, "암호 스터디", bob, [alice, bob])
    study.type, study.field, study.status = "study", "암호학", "보류"
    db.commit()
    head = login(client, "alice")

    def names(query: str) -> list[str]:
        res = client.get(f"/api/workspaces{query}", headers=head)
        assert res.status_code == 200, res.text
        return [w["name"] for w in res.json()]

    assert names("") == ["웹 해킹", "암호 스터디"]
    assert names("?type=study") == ["암호 스터디"]
    assert names("?field=암호학") == ["암호 스터디"]
    assert names("?status=보류") == ["암호 스터디"]
    assert names(f"?leaderId={bob.id}") == ["암호 스터디"]
    assert names("?q=해킹") == ["웹 해킹"]
    assert names("?order=name") == ["암호 스터디", "웹 해킹"]


def test_search_treats_wildcards_literally(client, people, db):
    alice = people["alice"]
    make_workspace(db, "웹 해킹", alice, [alice])
    res = client.get("/api/workspaces?q=%", headers=login(client, "alice"))
    assert res.json() == []
