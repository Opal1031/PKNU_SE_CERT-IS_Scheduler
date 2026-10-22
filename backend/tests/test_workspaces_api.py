"""활동 조회 API와 활동 권한 의존성(WritableWorkspace·LeaderWorkspace) 테스트."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import LeaderWorkspace, WritableWorkspace
from app.db.session import get_db
from tests.support import login, make_workspace, override_get_db


@pytest.fixture()
def spaces(db, people):
    """진행 중 활동 2개(웹 연구: alice 팀장·bob 팀원, 암호 스터디: carol)와 보관된 활동 1개."""
    alice, bob, carol = people["alice"], people["bob"], people["carol"]
    return {
        "web": make_workspace(db, "웹 연구", leader=alice, members=[alice, bob]),
        "crypto": make_workspace(db, "암호 스터디", leader=carol, members=[carol]),
        "old": make_workspace(db, "지난 프로젝트", leader=alice, members=[alice], status="보관"),
    }


def test_public_list_shows_only_ongoing_without_internal_fields(client, spaces):
    res = client.get("/api/public/workspaces")
    assert res.status_code == 200
    assert [w["name"] for w in res.json()] == ["웹 연구", "암호 스터디"]
    assert "memberIds" not in res.json()[0]


def test_member_sees_only_own_workspaces(client, spaces):
    bob = login(client, "bob")
    res = client.get("/api/workspaces", headers=bob)
    assert [w["name"] for w in res.json()] == ["웹 연구"]
    assert res.json()[0]["myRole"] == "member"
    assert client.get("/api/workspaces?scope=all", headers=bob).status_code == 403


def test_officer_can_list_all(client, spaces):
    res = client.get("/api/workspaces?scope=all", headers=login(client, "officer"))
    assert res.status_code == 200
    assert len(res.json()) == 3
    assert {w["myRole"] for w in res.json()} == {"viewer"}


def test_detail_permissions(client, spaces):
    web = spaces["web"].id
    assert client.get(f"/api/workspaces/{web}").status_code == 401
    assert client.get(f"/api/workspaces/{web}", headers=login(client, "carol")).status_code == 403
    assert client.get(f"/api/workspaces/{web}", headers=login(client, "alice")).json()["myRole"] == "leader"
    officer_view = client.get(f"/api/workspaces/{web}", headers=login(client, "officer"))
    assert officer_view.status_code == 200 and officer_view.json()["myRole"] == "viewer"
    assert client.get("/api/workspaces/9999", headers=login(client, "alice")).status_code == 404


# 변경 API(WBS 5.x)가 쓸 권한 의존성을 임시 라우트로 검증한다.
probe = FastAPI()


@probe.post("/probe/{workspace_id}/write")
def probe_write(ws: WritableWorkspace) -> dict[str, int]:
    return {"id": ws.id}


@probe.post("/probe/{workspace_id}/manage")
def probe_manage(ws: LeaderWorkspace) -> dict[str, int]:
    return {"id": ws.id}


@pytest.fixture()
def probe_client(client):
    probe.dependency_overrides[get_db] = override_get_db
    with TestClient(probe) as c:
        yield c
    probe.dependency_overrides.clear()


def test_write_and_manage_dependencies(client, probe_client, spaces):
    web, old = spaces["web"].id, spaces["old"].id
    alice, bob = login(client, "alice"), login(client, "bob")
    officer, carol = login(client, "officer"), login(client, "carol")

    assert probe_client.post(f"/probe/{web}/write", headers=bob).status_code == 200  # 팀원
    assert probe_client.post(f"/probe/{web}/write", headers=carol).status_code == 403  # 미참여
    assert probe_client.post(f"/probe/{web}/write", headers=officer).status_code == 403  # 임원진도 비참여면 수정 불가
    assert probe_client.post(f"/probe/{old}/write", headers=alice).status_code == 403  # 보관 활동

    assert probe_client.post(f"/probe/{web}/manage", headers=alice).status_code == 200  # 팀장
    assert probe_client.post(f"/probe/{web}/manage", headers=bob).status_code == 403  # 팀원
