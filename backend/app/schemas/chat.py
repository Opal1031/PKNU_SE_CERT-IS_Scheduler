"""채팅방·메시지·태그 요청·응답 스키마."""

from pydantic import Field

from app.schemas.common import CamelModel, UTCDateTime


class RoomCreate(CamelModel):
    """채팅방 생성. 참여자를 비우면 활동 구성원 전원이 들어간다."""

    name: str = Field(min_length=1, max_length=100)
    member_ids: list[int] = []
    tag_ids: list[int] = []


class RoomUpdate(CamelModel):
    """채팅방 수정. 보낸 항목만 바꾼다."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    member_ids: list[int] | None = None
    tag_ids: list[int] | None = None
    archived: bool | None = None


class RoomOut(CamelModel):
    """채팅방 응답."""

    id: int
    workspace_id: int
    name: str
    archived: bool
    member_ids: list[int]
    tag_ids: list[int]
    created_by: int
    created_at: UTCDateTime


class MessageCreate(CamelModel):
    """메시지 전송(REST). WebSocket 으로도 같은 형식을 보낸다."""

    body: str = Field(min_length=1, max_length=4000)


class MessageOut(CamelModel):
    """메시지 한 건."""

    id: int
    room_id: int
    author_id: int
    body: str
    created_at: UTCDateTime


class TagGroupCreate(CamelModel):
    name: str = Field(min_length=1, max_length=50)
    position: int = 0


class TagCreate(CamelModel):
    name: str = Field(min_length=1, max_length=50)
    position: int = 0


class TagOut(CamelModel):
    id: int
    group_id: int
    name: str
    position: int


class TagGroupOut(CamelModel):
    id: int
    workspace_id: int
    name: str
    position: int
    tags: list[TagOut]
