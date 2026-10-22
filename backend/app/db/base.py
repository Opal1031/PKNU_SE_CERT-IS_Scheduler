"""모든 테이블 모델이 상속하는 기반 클래스."""

import datetime as dt

from sqlalchemy import BigInteger, DateTime, Integer, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# 제약조건 이름을 규칙적으로 만들어 MySQL 오류 메시지와 ERD에서 어느 제약인지 바로 알 수 있게 한다.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# 메시지·감사 기록처럼 많이 쌓이는 테이블은 MySQL에서 BIGINT를 쓴다.
# SQLite는 INTEGER PRIMARY KEY만 자동 증가하므로 테스트 DB에서는 INTEGER로 바꾼다.
BigId = BigInteger().with_variant(Integer, "sqlite")


def utcnow() -> dt.datetime:
    """DB에는 시간대 없는 UTC 시각으로 저장한다."""
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    """선언형 모델의 기반 클래스. 제약조건 이름 규칙(NAMING_CONVENTION)을 메타데이터에 적용한다."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class CreatedAtMixin:
    """행을 만든 시각(created_at)을 자동으로 기록한다."""

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class TimestampMixin(CreatedAtMixin):
    """생성 시각에 더해, 행을 수정할 때마다 updated_at을 갱신한다."""

    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
