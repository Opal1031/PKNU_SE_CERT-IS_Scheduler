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
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class CreatedAtMixin:
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
