"""채팅방·메시지·실시간·태그 테스트."""

import pytest

from tests.support import login, make_workspace


@pytest.fixture()
def ws(db, people):
    return make_workspace(db, "활동", people["alice"], [people["alice"], people["bob"]])


def make_room(client, ws_id, head, **body):
    return client.post(f"/api/workspaces/{ws_id}/rooms", json={"name": "일반", **body}, headers=head)


# --- 방 생성·목록 --------------------------------------------------------


def test_create_room_defaults_to_all_workspace_members(client, people, ws):
    res = make_room(client, ws.id, login(client, "alice"))
    assert res.status_code == 201, res.text
    assert sorted(res.json()["memberIds"]) == sorted([people["alice"].id, people["bob"].id])


def test_create_room_with_subset_always_includes_creator(client, people, ws):
    res = make_room(client, ws.id, login(client, "alice"), memberIds=[people["bob"].id])
    assert sorted(res.json()["memberIds"]) == sorted([people["alice"].id, people["bob"].id])


def test_room_member_must_be_workspace_member(client, people, ws):
    res = make_room(client, ws.id, login(client, "alice"), memberIds=[people["carol"].id])
    assert res.status_code == 400


def test_non_member_cannot_create_room(client, people, ws):
    assert make_room(client, ws.id, login(client, "carol")).status_code == 403


def test_list_shows_only_rooms_i_joined(client, people, ws):
    alice = login(client, "alice")
    make_room(client, ws.id, alice, name="전체")
    make_room(client, ws.id, alice, name="앨리스만", memberIds=[people["alice"].id])
    assert [r["name"] for r in client.get(f"/api/workspaces/{ws.id}/rooms", headers=alice).json()] == [
        "전체",
        "앨리스만",
    ]
    bob_rooms = client.get(f"/api/workspaces/{ws.id}/rooms", headers=login(client, "bob")).json()
    assert [r["name"] for r in bob_rooms] == ["전체"]


def test_officer_outside_workspace_cannot_list_rooms(client, people, ws):
    res = client.get(f"/api/workspaces/{ws.id}/rooms", headers=login(client, "officer"))
    assert res.status_code == 403


# --- 방 수정 ------------------------------------------------------------


def test_update_room_name_and_members(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    res = client.patch(
        f"/api/rooms/{rid}", json={"name": "회의", "memberIds": [people["alice"].id]}, headers=head
    )
    assert res.status_code == 200
    assert res.json()["name"] == "회의" and res.json()["memberIds"] == [people["alice"].id]


def test_archived_room_is_hidden_but_can_be_restored(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    client.patch(f"/api/rooms/{rid}", json={"archived": True}, headers=head)
    assert client.get(f"/api/workspaces/{ws.id}/rooms", headers=head).json() == []
    assert len(client.get(f"/api/workspaces/{ws.id}/rooms?includeArchived=true", headers=head).json()) == 1
    # 보관된 방도 설정은 고칠 수 있어야 되돌릴 수 있다
    assert client.patch(f"/api/rooms/{rid}", json={"archived": False}, headers=head).status_code == 200


def test_empty_member_list_is_rejected(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    assert client.patch(f"/api/rooms/{rid}", json={"memberIds": []}, headers=head).status_code == 400


def test_outsider_cannot_update_room(client, people, ws):
    rid = make_room(client, ws.id, login(client, "alice"), memberIds=[people["alice"].id]).json()["id"]
    assert client.patch(f"/api/rooms/{rid}", json={"name": "x"}, headers=login(client, "bob")).status_code == 403


# --- 메시지 -------------------------------------------------------------


def send(client, rid, head, body):
    return client.post(f"/api/rooms/{rid}/messages", json={"body": body}, headers=head)


def test_send_and_read_messages_oldest_first(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    for i in range(3):
        assert send(client, rid, head, f"{i}").status_code == 201
    bodies = [m["body"] for m in client.get(f"/api/rooms/{rid}/messages", headers=head).json()]
    assert bodies == ["0", "1", "2"]


def test_before_pages_backwards(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    ids = [send(client, rid, head, str(i)).json()["id"] for i in range(5)]
    page = client.get(f"/api/rooms/{rid}/messages?before={ids[2]}&limit=2", headers=head).json()
    assert [m["body"] for m in page] == ["0", "1"]


def test_after_returns_only_new_messages(client, people, ws):
    """WebSocket 없이 폴링만으로 대화를 따라갈 수 있어야 한다."""
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    first = send(client, rid, head, "처음").json()["id"]
    send(client, rid, head, "다음")
    new = client.get(f"/api/rooms/{rid}/messages?after={first}", headers=head).json()
    assert [m["body"] for m in new] == ["다음"]


def test_non_room_member_cannot_read_or_send(client, people, ws):
    rid = make_room(client, ws.id, login(client, "alice"), memberIds=[people["alice"].id]).json()["id"]
    bob = login(client, "bob")
    assert client.get(f"/api/rooms/{rid}/messages", headers=bob).status_code == 403
    assert send(client, rid, bob, "x").status_code == 403


def test_empty_message_is_rejected(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    assert send(client, rid, head, "").status_code == 422


def test_cannot_send_to_archived_room(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    client.patch(f"/api/rooms/{rid}", json={"archived": True}, headers=head)
    assert send(client, rid, head, "x").status_code == 403


# --- WebSocket ----------------------------------------------------------


def test_websocket_broadcasts_and_persists(client, people, ws):
    head = login(client, "alice")
    rid = make_room(client, ws.id, head).json()["id"]
    token = head["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/rooms/{rid}?token={token}") as socket:
        socket.send_json({"body": "안녕"})
        received = socket.receive_json()
    assert received["body"] == "안녕" and received["authorId"] == people["alice"].id
    # REST 로도 같은 메시지가 보인다
    assert [m["body"] for m in client.get(f"/api/rooms/{rid}/messages", headers=head).json()] == ["안녕"]


def test_websocket_rejects_bad_token(client, people, ws):
    rid = make_room(client, ws.id, login(client, "alice")).json()["id"]
    with pytest.raises(Exception):  # noqa: B017 - 연결이 거부되며 예외 종류는 클라이언트 구현에 달림
        with client.websocket_connect(f"/ws/rooms/{rid}?token=not-a-token") as socket:
            socket.receive_json()


def test_websocket_rejects_non_room_member(client, people, ws):
    rid = make_room(client, ws.id, login(client, "alice"), memberIds=[people["alice"].id]).json()["id"]
    token = login(client, "bob")["Authorization"].split()[1]
    with pytest.raises(Exception):  # noqa: B017
        with client.websocket_connect(f"/ws/rooms/{rid}?token={token}") as socket:
            socket.receive_json()


# --- 태그 ---------------------------------------------------------------


def test_tag_group_and_tag_flow(client, people, ws):
    head = login(client, "alice")
    group = client.post(f"/api/workspaces/{ws.id}/tag-groups", json={"name": "주차"}, headers=head)
    assert group.status_code == 201 and group.json()["tags"] == []
    gid = group.json()["id"]
    added = client.post(f"/api/tag-groups/{gid}/tags", json={"name": "1주차"}, headers=head)
    assert added.status_code == 201 and [t["name"] for t in added.json()["tags"]] == ["1주차"]

    listed = client.get(f"/api/workspaces/{ws.id}/tag-groups", headers=head).json()
    assert [t["name"] for t in listed[0]["tags"]] == ["1주차"]

    tag_id = added.json()["tags"][0]["id"]
    assert client.delete(f"/api/tags/{tag_id}", headers=head).status_code == 204
    assert client.get(f"/api/workspaces/{ws.id}/tag-groups", headers=head).json()[0]["tags"] == []


def test_duplicate_tag_group_name_is_rejected(client, people, ws):
    head = login(client, "alice")
    client.post(f"/api/workspaces/{ws.id}/tag-groups", json={"name": "주차"}, headers=head)
    res = client.post(f"/api/workspaces/{ws.id}/tag-groups", json={"name": "주차"}, headers=head)
    assert res.status_code == 409


def test_room_can_carry_tags(client, people, ws):
    head = login(client, "alice")
    gid = client.post(f"/api/workspaces/{ws.id}/tag-groups", json={"name": "주차"}, headers=head).json()["id"]
    tag_id = client.post(f"/api/tag-groups/{gid}/tags", json={"name": "1주차"}, headers=head).json()["tags"][0]["id"]
    room = make_room(client, ws.id, head, tagIds=[tag_id])
    assert room.json()["tagIds"] == [tag_id]
