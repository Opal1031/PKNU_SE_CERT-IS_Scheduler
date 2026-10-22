"""테스트용 DB 엔진과 데이터 생성 도우미.

기본은 메모리 SQLite로 빠르게 실행하고, TEST_DATABASE_URL이 있으면(CI의 MySQL 서비스)
같은 테스트를 실제 MySQL에서 실행한다.
"""

import os
from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.models import User, Workspace, WorkspaceMember

PASSWORD = "password123"
PASSWORD_HASH = hash_password(PASSWORD)  # 해시 계산이 느리므로 한 번만 만든다.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

if TEST_DATABASE_URL:
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    # 앱(app.db.session)과 마찬가지로 SQLite에서도 외래 키 검사를 켠다.
    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def override_get_db() -> Iterator[Session]:
    """앱의 get_db 대신 테스트 DB 세션을 주입한다."""
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


def make_user(db: Session, username: str, role: str = "member", active: bool = True) -> User:
    user = User(username=username, name=username, role=role, is_active=active, password_hash=PASSWORD_HASH)
    db.add(user)
    db.commit()
    return user


def make_workspace(db: Session, name: str, leader: User, members: list[User], status: str = "진행 중") -> Workspace:
    ws = Workspace(
        type="project",
        name=name,
        initial=name[:2],
        field="웹 보안",
        status=status,
        leader_id=leader.id,
        created_by=leader.id,
    )
    ws.memberships = [WorkspaceMember(user_id=m.id) for m in members]
    db.add(ws)
    db.commit()
    return ws


def login(client: TestClient, username: str, password: str = PASSWORD) -> dict[str, str]:
    """로그인 후 Authorization 헤더를 돌려준다."""
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}
