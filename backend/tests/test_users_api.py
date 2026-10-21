from tests.support import PASSWORD, login


def test_member_cannot_use_admin_api(client, people):
    alice = login(client, "alice")
    assert client.get("/api/admin/users", headers=alice).status_code == 403
    new = {"username": "newbie", "name": "신입", "password": "password123"}
    assert client.post("/api/admin/users", json=new, headers=alice).status_code == 403
    assert (
        client.patch(f"/api/admin/users/{people['bob'].id}", json={"role": "officer"}, headers=alice).status_code == 403
    )


def test_admin_api_requires_login(client, people):
    assert client.get("/api/admin/users").status_code == 401


def test_officer_issues_account_that_can_login(client, people):
    admin = login(client, "officer")
    res = client.post(
        "/api/admin/users", json={"username": "newbie", "name": "신입", "password": "newpass123"}, headers=admin
    )
    assert res.status_code == 201
    assert res.json()["role"] == "member"
    assert client.post("/api/auth/login", json={"username": "newbie", "password": "newpass123"}).status_code == 200


def test_duplicate_username_conflicts(client, people):
    admin = login(client, "officer")
    res = client.post(
        "/api/admin/users", json={"username": "alice", "name": "중복", "password": "password123"}, headers=admin
    )
    assert res.status_code == 409


def test_invalid_account_input_is_rejected(client, people):
    admin = login(client, "officer")
    bad = [
        {"username": "a", "name": "짧은 아이디", "password": "password123"},
        {"username": "valid_id", "name": "짧은 비밀번호", "password": "short"},
        {"username": "valid_id", "name": "없는 역할", "password": "password123", "role": "admin"},
    ]
    for body in bad:
        assert client.post("/api/admin/users", json=body, headers=admin).status_code == 422


def test_officer_cannot_demote_or_disable_self(client, people):
    admin = login(client, "officer")
    me = people["officer"].id
    assert client.patch(f"/api/admin/users/{me}", json={"role": "member"}, headers=admin).status_code == 400
    assert client.patch(f"/api/admin/users/{me}", json={"isActive": False}, headers=admin).status_code == 400
    assert client.patch(f"/api/admin/users/{me}", json={"name": "운영진"}, headers=admin).status_code == 200


def test_officer_resets_forgotten_password(client, people):
    admin = login(client, "officer")
    url = f"/api/admin/users/{people['bob'].id}/password"
    assert client.put(url, json={"newPassword": "reset-pass1"}, headers=admin).status_code == 204
    assert client.post("/api/auth/login", json={"username": "bob", "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "bob", "password": "reset-pass1"}).status_code == 200


def test_password_reset_rules(client, people):
    admin, alice = login(client, "officer"), login(client, "alice")
    url = f"/api/admin/users/{people['bob'].id}/password"
    assert client.put(url, json={"newPassword": "reset-pass1"}, headers=alice).status_code == 403
    assert client.put(url, json={"newPassword": "reset-pass1"}).status_code == 401
    assert client.put(url, json={"newPassword": "short"}, headers=admin).status_code == 422
    missing = client.put("/api/admin/users/9999/password", json={"newPassword": "reset-pass1"}, headers=admin)
    assert missing.status_code == 404


def test_update_unknown_account(client, people):
    admin = login(client, "officer")
    assert client.patch("/api/admin/users/9999", json={"name": "x"}, headers=admin).status_code == 404


def test_user_list_is_brief_and_active_only(client, people):
    admin = login(client, "officer")
    client.patch(f"/api/admin/users/{people['carol'].id}", json={"isActive": False}, headers=admin)
    res = client.get("/api/users", headers=login(client, "alice"))
    assert res.status_code == 200
    names = [u["name"] for u in res.json()]
    assert "carol" not in names and "alice" in names
    assert set(res.json()[0]) == {"id", "name"}  # 역할·아이디 등은 노출하지 않음


def test_change_own_password(client, people):
    alice = login(client, "alice")
    wrong = {"currentPassword": "wrong-password", "newPassword": "brandnew123"}
    assert client.patch("/api/users/me/password", json=wrong, headers=alice).status_code == 400
    ok = {"currentPassword": PASSWORD, "newPassword": "brandnew123"}
    assert client.patch("/api/users/me/password", json=ok, headers=alice).status_code == 204
    assert client.post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "alice", "password": "brandnew123"}).status_code == 200
