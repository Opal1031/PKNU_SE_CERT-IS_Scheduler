"""테스트 공통 fixture. 테스트마다 테이블을 새로 만들어 서로 영향을 주지 않는다."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import User
from tests.support import TestingSession, engine, make_user, override_get_db


@pytest.fixture()
def db() -> Iterator[Session]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def people(db: Session) -> dict[str, User]:
    """임원진 1명, 일반부원 3명."""
    return {
        "officer": make_user(db, "officer", role="officer"),
        "alice": make_user(db, "alice"),
        "bob": make_user(db, "bob"),
        "carol": make_user(db, "carol"),
    }
