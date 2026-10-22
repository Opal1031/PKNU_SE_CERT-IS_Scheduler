"""DB 연결과 요청 단위 세션."""

import ssl
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import normalize_database_url, settings


def make_engine(url: str, ssl_ca: str | None = None) -> Engine:
    """DB 주소에 맞는 엔진을 만든다.

    SQLite(로컬 개발)는 외래 키 검사를 켜고, 그 밖의 주소(MySQL)는 PyMySQL 형식 변환·TLS·연결 유지 설정을 적용한다.
    """
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})

        # SQLite는 외래 키 검사가 기본으로 꺼져 있어 MySQL과 동작을 맞추기 위해 켠다.
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _record):  # pragma: no cover - 연결 시 1회 실행
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

        return engine
    url, tls = normalize_database_url(url)
    connect_args = {}
    if tls or ssl_ca:
        # 호스팅 DB는 인터넷으로 접속하므로 TLS로 암호화하고 인증서로 서버를 확인한다.
        connect_args["ssl"] = ssl.create_default_context(cadata=ssl_ca)
    # MySQL은 일정 시간 쓰지 않은 연결을 끊으므로 사용 전 확인(pre_ping)하고 주기적으로 교체한다.
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600, connect_args=connect_args)


# 앱 전체가 쓰는 엔진과 세션 팩토리. 커밋 후에도 객체 값을 만료시키지 않아 응답을 만들 때 다시 조회하지 않는다.
engine = make_engine(settings.database_url, settings.database_ssl_ca)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI 의존성: 요청마다 세션을 열고 응답 후 닫는다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
