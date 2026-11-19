"""회의록(Document) 요청·응답 스키마 (WBS 5.3)."""

from pydantic import Field

from app.schemas.common import CamelModel, UTCDateTime


class DocumentOut(CamelModel):
    """회의록 현재 내용. version은 저장할 때 baseVersion으로 다시 보낸다."""

    room_id: int
    body: str
    version: int
    updated_by: int
    updated_at: UTCDateTime


class DocumentSave(CamelModel):
    """회의록 저장 요청. baseVersion이 현재 version과 다르면 409로 거부한다."""

    body: str
    base_version: int = Field(ge=1, description="불러올 때 받은 version. 그 사이 남이 저장했으면 409")


class DocumentVersionOut(CamelModel):
    """버전 이력 한 건. body는 그 버전 저장 직전의 본문이다."""

    version: int
    body: str
    updated_by: int
    updated_at: UTCDateTime


class DocumentConflictOut(CamelModel):
    """409 응답. 화면이 최신 내용을 보여 주고 사용자가 합칠 수 있도록 현재 상태를 함께 준다."""

    detail: str
    current_version: int
    current_body: str
    updated_by: int
    updated_at: UTCDateTime
