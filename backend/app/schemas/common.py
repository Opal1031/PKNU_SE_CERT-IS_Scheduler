"""요청·응답 스키마 공통 설정.

프론트엔드(TypeScript)가 camelCase를 쓰므로 JSON 필드는 camelCase로 주고받고,
파이썬 코드 안에서는 snake_case를 그대로 쓴다.
"""

import datetime as dt
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """모든 스키마의 기반. JSON은 camelCase로 주고받고, ORM 객체에서 바로 변환할 수 있다."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


def _utc_iso(value: dt.datetime) -> str:
    # DB에는 시간대 없이 UTC로 저장하므로 응답할 때 UTC 표시(Z)를 붙여 브라우저가 한국 시간으로 바꿀 수 있게 한다.
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.UTC)
    return value.astimezone(dt.UTC).isoformat().replace("+00:00", "Z")


# 응답에서 UTC ISO 문자열(...Z)로 내보내는 시각 타입
UTCDateTime = Annotated[dt.datetime, PlainSerializer(_utc_iso, return_type=str)]


class ErrorOut(BaseModel):
    """오류 응답 형식. detail에 거부 사유 메시지가 담긴다(API 문서의 오류 응답 표시용)."""

    detail: str
