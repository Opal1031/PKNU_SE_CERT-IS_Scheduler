"""회의록 불러오기·저장·버전 이력 테스트 (WBS 5.3)."""

import pytest
from sqlalchemy import select

from app.models import ChatRoom, ChatRoomMember, Document
from tests.support import login, make_workspace


@pytest.fixture()
def room(db, people):
    """alice(팀장)·bob 이 참여한 활동과 그 활동의 채팅방."""
    ws = make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])
    r = ChatRoom(workspace_id=ws.id, name="일반", created_by=people["alice"].id)
    r.members = [ChatRoomMember(user_id=people["alice"].id), ChatRoomMember(user_id=people["bob"].id)]
    db.add(r)
    db.commit()
    return r


# --- 불러오기 -----------------------------------------------------------


def test_first_load_creates_empty_document(client, people, room):
    res = client.get(f"/api/rooms/{room.id}/document", headers=login(client, "alice"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["body"] == "" and body["version"] == 1 and body["roomId"] == room.id


def test_non_member_cannot_read(client, people, room):
    res = client.get(f"/api/rooms/{room.id}/document", headers=login(client, "carol"))
    assert res.status_code == 403


def test_officer_not_in_room_cannot_read(client, people, room):
    """임원진의 운영 조회 권한은 대화·회의록 내용까지 넓히지 않는다."""
    res = client.get(f"/api/rooms/{room.id}/document", headers=login(client, "officer"))
    assert res.status_code == 403


def test_unknown_room_returns_404(client, people):
    res = client.get("/api/rooms/9999/document", headers=login(client, "alice"))
    assert res.status_code == 404


# --- 저장 ---------------------------------------------------------------


def test_save_increments_version(client, people, room):
    head = login(client, "alice")
    client.get(f"/api/rooms/{room.id}/document", headers=head)
    res = client.put(f"/api/rooms/{room.id}/document", json={"body": "## 회의록", "baseVersion": 1}, headers=head)
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2 and res.json()["body"] == "## 회의록"


def test_save_without_loading_first_works(client, people, room):
    """불러오기를 거치지 않고 바로 저장해도 불러온 뒤 저장한 것과 같은 결과가 된다."""
    res = client.put(
        f"/api/rooms/{room.id}/document", json={"body": "바로 저장", "baseVersion": 1}, headers=login(client, "alice")
    )
    assert res.status_code == 200
    assert res.json()["version"] == 2 and res.json()["body"] == "바로 저장"


def test_stale_base_version_returns_409_with_current_content(client, people, room):
    """두 사람이 같은 버전에서 출발하면 나중 저장이 409로 거부되고 최신 내용을 함께 받는다."""
    alice, bob = login(client, "alice"), login(client, "bob")
    client.get(f"/api/rooms/{room.id}/document", headers=alice)
    client.put(f"/api/rooms/{room.id}/document", json={"body": "앨리스 저장", "baseVersion": 1}, headers=alice)

    res = client.put(f"/api/rooms/{room.id}/document", json={"body": "밥 저장", "baseVersion": 1}, headers=bob)
    assert res.status_code == 409
    body = res.json()
    assert body["currentVersion"] == 2
    assert body["currentBody"] == "앨리스 저장"  # 덮어쓰지 않았음
    assert body["updatedBy"] == people["alice"].id


def test_conflicting_save_does_not_change_stored_body(client, people, room, db):
    alice, bob = login(client, "alice"), login(client, "bob")
    client.put(f"/api/rooms/{room.id}/document", json={"body": "원본", "baseVersion": 1}, headers=alice)
    client.put(f"/api/rooms/{room.id}/document", json={"body": "덮어쓰기", "baseVersion": 1}, headers=bob)
    doc = db.scalar(select(Document).where(Document.room_id == room.id))
    db.refresh(doc)
    assert doc.body == "원본"


def test_non_member_cannot_save(client, people, room):
    res = client.put(
        f"/api/rooms/{room.id}/document", json={"body": "x", "baseVersion": 1}, headers=login(client, "carol")
    )
    assert res.status_code == 403


def test_cannot_save_in_archived_workspace(client, people, room, db):
    """보관된 활동은 조회 전용이라 저장이 막힌다."""
    ws = db.get(type(room).__mro__[0], room.id)  # noqa: F841 - room 은 이미 로드됨
    from app.models import Workspace

    db.get(Workspace, room.workspace_id).status = "보관"
    db.commit()
    res = client.put(
        f"/api/rooms/{room.id}/document", json={"body": "x", "baseVersion": 1}, headers=login(client, "alice")
    )
    assert res.status_code == 403


def test_base_version_must_be_positive(client, people, room):
    res = client.put(
        f"/api/rooms/{room.id}/document", json={"body": "x", "baseVersion": 0}, headers=login(client, "alice")
    )
    assert res.status_code == 422


# --- 버전 이력 ----------------------------------------------------------


def test_versions_are_listed_newest_first(client, people, room):
    head = login(client, "alice")
    for i in range(1, 4):
        client.put(f"/api/rooms/{room.id}/document", json={"body": f"{i}회차", "baseVersion": i}, headers=head)
    res = client.get(f"/api/rooms/{room.id}/document/versions", headers=head)
    assert res.status_code == 200
    versions = res.json()
    # 이력에는 '그 버전으로 저장되기 직전의 본문'이 남는다. v1은 빈 회의록 상태였다.
    assert [v["version"] for v in versions] == [3, 2, 1]
    assert versions[0]["body"] == "2회차"
    assert versions[-1]["body"] == ""


def test_versions_are_capped_at_ten(client, people, room):
    head = login(client, "alice")
    for i in range(1, 15):
        client.put(f"/api/rooms/{room.id}/document", json={"body": f"{i}", "baseVersion": i}, headers=head)
    res = client.get(f"/api/rooms/{room.id}/document/versions", headers=head)
    assert len(res.json()) == 10


def test_versions_empty_before_first_save(client, people, room):
    res = client.get(f"/api/rooms/{room.id}/document/versions", headers=login(client, "alice"))
    assert res.json() == []
