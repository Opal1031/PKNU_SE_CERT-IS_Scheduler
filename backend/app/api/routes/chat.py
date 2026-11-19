"""활동 내부 채팅방·메시지·태그.

방은 활동에 속하고, 참여자는 활동 구성원 중에서 따로 고른다. 회의록(WBS 5.3)이
방에 1:1로 붙으므로 방을 나누면 회의별로 회의록이 생긴다.

실시간 송수신은 두 경로를 둔다.

- 폴링: GET /messages?after={마지막ID} — **운영 환경(Vercel)에서 쓰는 방식**
- WebSocket: /ws/rooms/{roomId} — 로컬·Docker 실행에서만 동작

Vercel 서버리스는 WebSocket 업그레이드를 지원하지 않아 배포 환경에서는 연결이 즉시
끊긴다(2026-11-19 확인). 그래서 프론트엔드는 폴링을 기본으로 구현하고, WebSocket 은
로컬 개발과 Docker 배포에서만 쓴다. 두 경로 모두 같은 MessageOut 형식을 돌려주므로
화면 코드는 수신 경로만 바꾸면 된다.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, ReadableRoom, WritableRoom, forbidden, load_room, load_workspace
from app.core import permissions as perm
from app.core.security import decode_access_token
from app.models import ChatRoom, ChatRoomMember, Message, Tag, TagGroup, User, Workspace, chat_room_tags
from app.schemas.chat import (
    MessageCreate,
    MessageOut,
    RoomCreate,
    RoomOut,
    RoomUpdate,
    TagCreate,
    TagGroupCreate,
    TagGroupOut,
)
from app.schemas.common import ErrorOut

router = APIRouter(tags=["채팅"])

MESSAGE_PAGE = 50


# --- 방 -----------------------------------------------------------------


def _tag_ids(db: DB, room_id: int) -> list[int]:
    return list(db.scalars(select(chat_room_tags.c.tag_id).where(chat_room_tags.c.room_id == room_id)))


def _room_out(db: DB, room: ChatRoom) -> RoomOut:
    return RoomOut.model_validate(
        {
            "id": room.id,
            "workspace_id": room.workspace_id,
            "name": room.name,
            "archived": room.archived,
            "member_ids": room.member_ids,
            "tag_ids": _tag_ids(db, room.id),
            "created_by": room.created_by,
            "created_at": room.created_at,
        }
    )


def _check_members_are_in_workspace(ws: Workspace, user_ids: list[int]) -> None:
    """방 참여자는 그 활동의 구성원이어야 한다."""
    outsiders = [uid for uid in user_ids if uid not in set(ws.member_ids)]
    if outsiders:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"활동 구성원이 아닌 사용자: {outsiders}")


@router.get(
    "/api/workspaces/{workspace_id}/rooms",
    response_model=list[RoomOut],
    summary="채팅방 목록",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def list_rooms(
    workspace_id: int,
    db: DB,
    user: CurrentUser,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = False,
) -> list[RoomOut]:
    """내가 참여한 방만 돌려준다. 활동 구성원이라도 초대되지 않은 방은 보이지 않는다."""
    ws = load_workspace(db, workspace_id)
    if not perm.is_member(ws, user):
        raise forbidden("활동 구성원만 채팅방을 볼 수 있음")
    query = (
        select(ChatRoom)
        .where(ChatRoom.workspace_id == workspace_id)
        .options(selectinload(ChatRoom.members))
        .order_by(ChatRoom.id)
    )
    if not include_archived:
        query = query.where(ChatRoom.archived.is_(False))
    return [_room_out(db, room) for room in db.scalars(query) if user.id in room.member_ids]


@router.post(
    "/api/workspaces/{workspace_id}/rooms",
    response_model=RoomOut,
    status_code=status.HTTP_201_CREATED,
    summary="채팅방 생성",
    responses={status.HTTP_400_BAD_REQUEST: {"model": ErrorOut}, status.HTTP_403_FORBIDDEN: {"model": ErrorOut}},
)
def create_room(workspace_id: int, body: RoomCreate, db: DB, user: CurrentUser) -> RoomOut:
    """방을 만든다. 참여자를 비우면 활동 구성원 전원이 들어가고, 만든 사람은 항상 포함된다."""
    ws = load_workspace(db, workspace_id)
    if not perm.can_write_workspace(ws, user):
        raise forbidden("활동 구성원만 채팅방을 만들 수 있음. 보관 활동은 조회 전용임")

    member_ids = list(dict.fromkeys(body.member_ids or list(ws.member_ids)))
    if user.id not in member_ids:
        member_ids.insert(0, user.id)
    _check_members_are_in_workspace(ws, member_ids)

    room = ChatRoom(workspace_id=ws.id, name=body.name, created_by=user.id)
    room.members = [ChatRoomMember(user_id=uid) for uid in member_ids]
    db.add(room)
    db.flush()
    for tag_id in dict.fromkeys(body.tag_ids):
        db.execute(insert(chat_room_tags).values(room_id=room.id, tag_id=tag_id))
    db.commit()
    db.refresh(room)
    return _room_out(db, room)


@router.patch(
    "/api/rooms/{room_id}",
    response_model=RoomOut,
    summary="채팅방 수정 (이름·참여자·태그·보관)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def update_room(room_id: int, body: RoomUpdate, db: DB, user: CurrentUser) -> RoomOut:
    """방 설정을 바꾼다. 보관을 풀 수도 있어야 해서 보관된 방에서도 이 API는 열려 있다."""
    room, ws = load_room(db, room_id)
    if not perm.is_member(ws, user) or user.id not in room.member_ids:
        raise forbidden("이 방에 참여한 활동 구성원만 수정할 수 있음")
    if ws.status == perm.ARCHIVED:
        raise forbidden("보관된 활동은 조회 전용임")

    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is not None:
        room.name = changes["name"]
    if changes.get("archived") is not None:
        room.archived = changes["archived"]
    if changes.get("member_ids") is not None:
        member_ids = list(dict.fromkeys(changes["member_ids"]))
        if not member_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="참여자는 최소 1명이어야 함")
        _check_members_are_in_workspace(ws, member_ids)
        existing = {m.user_id: m for m in room.members}
        room.members = [existing.get(uid) or ChatRoomMember(user_id=uid) for uid in member_ids]
    if changes.get("tag_ids") is not None:
        db.execute(delete(chat_room_tags).where(chat_room_tags.c.room_id == room.id))
        for tag_id in dict.fromkeys(changes["tag_ids"]):
            db.execute(insert(chat_room_tags).values(room_id=room.id, tag_id=tag_id))
    db.commit()
    db.refresh(room)
    return _room_out(db, room)


# --- 메시지 -------------------------------------------------------------


@router.get(
    "/api/rooms/{room_id}/messages",
    response_model=list[MessageOut],
    summary="메시지 조회 (이전 페이지 / 새 메시지 폴링)",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def list_messages(
    room: ReadableRoom,
    db: DB,
    before: Annotated[int | None, Query(description="이 ID보다 이전 메시지(과거로 더 불러오기)")] = None,
    after: Annotated[int | None, Query(description="이 ID 이후 메시지(새 메시지 폴링)")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = MESSAGE_PAGE,
) -> list[MessageOut]:
    """항상 오래된 것부터 정렬해 돌려준다.

    before 는 과거로 거슬러 올라갈 때(위로 스크롤), after 는 새 메시지를 가져올 때 쓴다.
    운영 환경에서는 WebSocket 을 쓸 수 없으므로 after 폴링이 실시간 수신의 기본 경로다.
    새 메시지가 없으면 빈 목록을 돌려주므로 짧은 주기로 반복 호출해도 된다.
    """
    query = select(Message).where(Message.room_id == room.id)
    if after is not None:
        rows = list(db.scalars(query.where(Message.id > after).order_by(Message.id).limit(limit)))
    else:
        if before is not None:
            query = query.where(Message.id < before)
        # 최신 limit 개를 가져온 뒤 오래된 순으로 뒤집는다.
        rows = list(db.scalars(query.order_by(Message.id.desc()).limit(limit)))[::-1]
    return rows


@router.post(
    "/api/rooms/{room_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="메시지 전송",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def send_message(body: MessageCreate, room: WritableRoom, db: DB, user: CurrentUser) -> Message:
    """메시지를 남긴다. WebSocket 을 쓸 수 없는 환경에서도 대화가 가능하도록 REST 로도 연다."""
    message = Message(room_id=room.id, author_id=user.id, body=body.body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


# --- 실시간(WebSocket) ---------------------------------------------------


class RoomConnections:
    """방별 WebSocket 연결 목록.

    한 프로세스 안에서만 유효하다. 여러 인스턴스로 배포되면 다른 인스턴스에 붙은
    사람에게는 전달되지 않는다. Vercel 에서는 연결 자체가 되지 않으므로 폴링을 쓴다.
    """

    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = {}

    async def join(self, room_id: int, socket: WebSocket) -> None:
        await socket.accept()
        self._rooms.setdefault(room_id, set()).add(socket)

    def leave(self, room_id: int, socket: WebSocket) -> None:
        self._rooms.get(room_id, set()).discard(socket)

    async def broadcast(self, room_id: int, payload: dict) -> None:
        for socket in list(self._rooms.get(room_id, set())):
            try:
                await socket.send_json(payload)
            except Exception:  # noqa: BLE001 - 끊긴 연결은 조용히 정리한다
                self.leave(room_id, socket)


connections = RoomConnections()


@router.websocket("/ws/rooms/{room_id}")
async def chat_socket(websocket: WebSocket, room_id: int, db: DB, token: str = Query(...)) -> None:
    """실시간 송수신 (로컬·Docker 전용. Vercel 배포에서는 연결되지 않는다).

    브라우저 WebSocket 은 헤더를 붙일 수 없어 토큰을 쿼리로 받는다. 연결 시 한 번
    권한을 확인하고, 받은 메시지는 저장한 뒤 같은 방의 다른 연결에 그대로 전달한다.

    운영 환경에서는 GET /messages?after= 폴링이 이 역할을 대신한다.

    DB 세션은 get_db 의존성으로 받는다. SessionLocal 을 직접 쓰면 테스트에서 세션을
    바꿔 끼울 수 없어 연결 자체를 검증할 수 없다.
    """
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    room = db.get(ChatRoom, room_id)
    if room is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    workspace = db.get(Workspace, room.workspace_id)
    member_ids = list(db.scalars(select(ChatRoomMember.user_id).where(ChatRoomMember.room_id == room_id)))
    if not perm.can_send_chat(room.archived, member_ids, workspace, user):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await connections.join(room_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            body = ((data or {}).get("body") or "").strip()
            if not body:
                continue
            message = Message(room_id=room_id, author_id=user.id, body=body[:4000])
            db.add(message)
            db.commit()
            db.refresh(message)
            payload = MessageOut.model_validate(message).model_dump(by_alias=True, mode="json")
            await connections.broadcast(room_id, payload)
    except WebSocketDisconnect:
        pass
    finally:
        connections.leave(room_id, websocket)


# --- 태그 ---------------------------------------------------------------


def _tag_out(tag: Tag) -> dict:
    return {"id": tag.id, "group_id": tag.group_id, "name": tag.name, "position": tag.position}


@router.get(
    "/api/workspaces/{workspace_id}/tag-groups",
    response_model=list[TagGroupOut],
    summary="태그 그룹·태그 목록",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def list_tag_groups(workspace_id: int, db: DB, user: CurrentUser) -> list[TagGroupOut]:
    ws = load_workspace(db, workspace_id)
    if not perm.can_view_workspace(ws, user):
        raise forbidden("활동 구성원 또는 임원진만 조회할 수 있음")
    groups = db.scalars(
        select(TagGroup).where(TagGroup.workspace_id == workspace_id).order_by(TagGroup.position, TagGroup.id)
    )
    out = []
    for group in groups:
        tags = db.scalars(select(Tag).where(Tag.group_id == group.id).order_by(Tag.position, Tag.id))
        out.append(
            TagGroupOut.model_validate(
                {
                    "id": group.id,
                    "workspace_id": group.workspace_id,
                    "name": group.name,
                    "position": group.position,
                    "tags": [_tag_out(t) for t in tags],
                }
            )
        )
    return out


@router.post(
    "/api/workspaces/{workspace_id}/tag-groups",
    response_model=TagGroupOut,
    status_code=status.HTTP_201_CREATED,
    summary="태그 그룹 추가",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_409_CONFLICT: {"model": ErrorOut}},
)
def create_tag_group(workspace_id: int, body: TagGroupCreate, db: DB, user: CurrentUser) -> TagGroupOut:
    ws = load_workspace(db, workspace_id)
    if not perm.can_write_workspace(ws, user):
        raise forbidden("활동 구성원만 변경 가능함. 보관 활동은 조회 전용임")
    if db.scalar(select(TagGroup.id).where(TagGroup.workspace_id == ws.id, TagGroup.name == body.name)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="같은 이름의 태그 그룹이 이미 있음")
    group = TagGroup(workspace_id=ws.id, name=body.name, position=body.position)
    db.add(group)
    db.commit()
    db.refresh(group)
    return TagGroupOut.model_validate(
        {"id": group.id, "workspace_id": group.workspace_id, "name": group.name, "position": group.position, "tags": []}
    )


@router.post(
    "/api/tag-groups/{group_id}/tags",
    response_model=TagGroupOut,
    status_code=status.HTTP_201_CREATED,
    summary="태그 추가",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_409_CONFLICT: {"model": ErrorOut}},
)
def create_tag(group_id: int, body: TagCreate, db: DB, user: CurrentUser) -> TagGroupOut:
    group = db.get(TagGroup, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="태그 그룹을 찾을 수 없음")
    ws = load_workspace(db, group.workspace_id)
    if not perm.can_write_workspace(ws, user):
        raise forbidden("활동 구성원만 변경 가능함. 보관 활동은 조회 전용임")
    if db.scalar(select(Tag.id).where(Tag.group_id == group.id, Tag.name == body.name)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="같은 이름의 태그가 이미 있음")
    db.add(Tag(group_id=group.id, name=body.name, position=body.position))
    db.commit()
    tags = db.scalars(select(Tag).where(Tag.group_id == group.id).order_by(Tag.position, Tag.id))
    return TagGroupOut.model_validate(
        {
            "id": group.id,
            "workspace_id": group.workspace_id,
            "name": group.name,
            "position": group.position,
            "tags": [_tag_out(t) for t in tags],
        }
    )


@router.delete(
    "/api/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="태그 삭제",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def delete_tag(tag_id: int, db: DB, user: CurrentUser) -> None:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="태그를 찾을 수 없음")
    group = db.get(TagGroup, tag.group_id)
    ws = load_workspace(db, group.workspace_id)
    if not perm.can_write_workspace(ws, user):
        raise forbidden("활동 구성원만 변경 가능함. 보관 활동은 조회 전용임")
    db.delete(tag)
    db.commit()
