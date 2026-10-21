from tests.support import PASSWORD, login, make_user


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_login_returns_token_and_role(client, people):
    res = client.post("/api/auth/login", json={"username": "officer", "password": PASSWORD})
    assert res.status_code == 200
    body = res.json()
    assert body["tokenType"] == "bearer" and body["accessToken"]
    assert body["user"]["role"] == "officer" and body["user"]["officer"] is True
    assert "passwordHash" not in body["user"]


def test_login_wrong_password_and_unknown_user_look_the_same(client, people):
    wrong = client.post("/api/auth/login", json={"username": "alice", "password": "nope"})
    unknown = client.post("/api/auth/login", json={"username": "nobody", "password": "nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()  # 아이디 존재 여부가 응답에 드러나지 않음


def test_inactive_account_cannot_login(client, db):
    make_user(db, "left", active=False)
    res = client.post("/api/auth/login", json={"username": "left", "password": PASSWORD})
    assert res.status_code == 403


def test_me_requires_valid_token(client, people):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    me = client.get("/api/auth/me", headers=login(client, "alice"))
    assert me.status_code == 200
    assert me.json()["username"] == "alice" and me.json()["officer"] is False


def test_role_change_applies_to_existing_token(client, people):
    alice = login(client, "alice")
    admin = login(client, "officer")
    assert client.get("/api/admin/users", headers=alice).status_code == 403
    res = client.patch(f"/api/admin/users/{people['alice'].id}", json={"role": "officer"}, headers=admin)
    assert res.status_code == 200
    # 다시 로그인하지 않아도 DB의 최신 역할로 판단한다.
    assert client.get("/api/admin/users", headers=alice).status_code == 200


def test_deactivated_user_token_stops_working(client, people):
    bob = login(client, "bob")
    admin = login(client, "officer")
    client.patch(f"/api/admin/users/{people['bob'].id}", json={"isActive": False}, headers=admin)
    assert client.get("/api/auth/me", headers=bob).status_code == 401


def test_cors_allows_frontend_dev_server(client):
    """프론트 개발 서버(127.0.0.1:8765)에서 토큰을 붙여 호출할 수 있어야 한다(브라우저 사전 요청)."""
    for path, method, headers in [
        ("/api/auth/login", "POST", "content-type"),
        ("/api/auth/me", "GET", "authorization"),
    ]:
        res = client.options(
            path,
            headers={
                "Origin": "http://127.0.0.1:8765",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": headers,
            },
        )
        assert res.status_code == 200
        assert res.headers["access-control-allow-origin"] == "http://127.0.0.1:8765"


def test_cors_rejects_unknown_origin(client):
    res = client.options(
        "/api/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers
