"""활동(프로젝트·스터디) 조회·등록·수정·구성원 관리·참가 신청 (WBS 5.1).

변경 API는 deps의 LeaderWorkspace(팀장) 의존성으로 권한을 검사한다.
권한 규칙 자체는 app.core.permissions에 있고 여기서는 HTTP 상태 코드로만 옮긴다.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, LeaderWorkspace, ViewableWorkspace, forbidden, load_workspace
from app.core import permissions as perm
from app.models import ChatRoom, ChatRoomMember, User, Workspace, WorkspaceApplication, WorkspaceMember
from app.schemas.common import ErrorOut
from app.schemas.workspace import (
    ApplicationOut,
    MembersUpdate,
    PublicWorkspaceOut,
    WorkspaceCreate,
    WorkspaceOut,
    WorkspaceUpdate,
)

router = APIRouter(tags=["활동"])


def to_out(ws: Workspace, user: User) -> WorkspaceOut:
    """활동을 응답 형식으로 바꾸면서 요청한 사용자의 관계(my_role: 팀장/팀원/viewer)를 붙인다."""
    my_role = "leader" if perm.is_leader(ws, user) else "member" if perm.is_member(ws, user) else "viewer"
    return WorkspaceOut.model_validate(
        {
            "id": ws.id,
            "type": ws.type,
            "name": ws.name,
            "initial": ws.initial,
            "field": ws.field,
            "status": ws.status,
            "goal": ws.goal,
            "start_date": ws.start_date,
            "end_date": ws.end_date,
            "leader_id": ws.leader_id,
            "created_by": ws.created_by,
            "member_ids": ws.member_ids,
            "updated_at": ws.updated_at,
            "my_role": my_role,
        }
    )


@router.get("/api/public/workspaces", response_model=list[PublicWorkspaceOut], summary="진행 중인 활동 소개(비로그인)")
def public_workspaces(db: DB) -> list[Workspace]:
    """로그인 전 '진행 중인 활동' 화면. 구성원·일정 같은 내부 정보는 공개하지 않는다."""
    return list(db.scalars(select(Workspace).where(Workspace.status == "진행 중").order_by(Workspace.id)))


@router.get(
    "/api/workspaces",
    response_model=list[WorkspaceOut],
    summary="활동 목록 (담당자·상태·분야·검색 필터)",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}},
)
def list_workspaces(
    db: DB,
    user: CurrentUser,
    scope: Annotated[
        Literal["mine", "all"], Query(description="mine=내가 참여한 활동, all=전체 활동(임원진 전용)")
    ] = "mine",
    type: Annotated[Literal["project", "study"] | None, Query(description="프로젝트/스터디")] = None,
    field: Annotated[str | None, Query(description="보안 분야")] = None,
    status_: Annotated[str | None, Query(alias="status", description="진행 상태")] = None,
    leader_id: Annotated[int | None, Query(alias="leaderId", description="팀장 사용자 ID")] = None,
    q: Annotated[str | None, Query(description="이름·목표 검색어")] = None,
    order: Annotated[Literal["id", "name", "updated"], Query(description="정렬 기준")] = "id",
) -> list[WorkspaceOut]:
    """기본은 내가 참여한 활동만, scope=all이면 전체 활동을 돌려준다(임원진 전용, 일반부원은 403).

    필터는 모두 선택이며 지정한 것끼리 AND로 묶인다. q는 이름과 목표에서 부분 일치로 찾는다.
    """
    query = select(Workspace).options(selectinload(Workspace.memberships))
    if scope == "all":
        if not perm.is_officer(user):
            raise forbidden("전체 활동 운영 조회는 임원진만 가능함")
    else:
        query = query.where(
            Workspace.id.in_(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id))
        )
    if type is not None:
        query = query.where(Workspace.type == type)
    if field:
        query = query.where(Workspace.field == field)
    if status_:
        query = query.where(Workspace.status == status_)
    if leader_id is not None:
        query = query.where(Workspace.leader_id == leader_id)
    if q:
        # 사용자가 넣은 %와 _ 는 와일드카드가 아니라 글자 그대로 찾는다.
        pattern = f"%{q.replace('!', '!!').replace('%', '!%').replace('_', '!_')}%"
        query = query.where(or_(Workspace.name.like(pattern, escape="!"), Workspace.goal.like(pattern, escape="!")))
    columns = {"id": Workspace.id, "name": Workspace.name, "updated": Workspace.updated_at.desc()}
    query = query.order_by(columns[order])
    return [to_out(ws, user) for ws in db.scalars(query)]


@router.get(
    "/api/workspaces/{workspace_id}",
    response_model=WorkspaceOut,
    summary="활동 상세",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def get_workspace(ws: ViewableWorkspace, user: CurrentUser) -> WorkspaceOut:
    """구성원은 팀장/팀원으로, 참여하지 않은 임원진은 viewer(조회 전용)로 응답한다."""
    return to_out(ws, user)


def _check_users_exist(db: DB, user_ids: list[int]) -> None:
    """구성원으로 지정한 ID가 모두 실제 활성 계정인지 확인한다. 하나라도 없으면 400."""
    if not user_ids:
        return
    found = set(db.scalars(select(User.id).where(User.id.in_(user_ids), User.is_active.is_(True))))
    missing = [uid for uid in user_ids if uid not in found]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"없거나 사용할 수 없는 계정: {missing}")


@router.post(
    "/api/workspaces",
    response_model=WorkspaceOut,
    status_code=status.HTTP_201_CREATED,
    summary="활동 등록",
    responses={status.HTTP_400_BAD_REQUEST: {"model": ErrorOut}},
)
def create_workspace(body: WorkspaceCreate, db: DB, user: CurrentUser) -> WorkspaceOut:
    """활동을 만든다. 만든 사람이 최초 팀장이 되고 구성원에 반드시 포함된다.

    기본 채팅방 '일반'을 함께 만들어 구성원 전원을 넣는다(회의록·채팅이 방에 종속되므로).
    """
    member_ids = list(dict.fromkeys([user.id, *body.member_ids]))  # 생성자를 맨 앞에, 중복 제거
    _check_users_exist(db, member_ids)

    ws = Workspace(
        type=body.type,
        name=body.name,
        initial=body.initial,
        field=body.field,
        status=body.status,
        goal=body.goal,
        start_date=body.start_date,
        end_date=body.end_date,
        leader_id=user.id,
        created_by=user.id,
    )
    ws.memberships = [WorkspaceMember(user_id=uid) for uid in member_ids]
    db.add(ws)
    db.flush()  # 채팅방에 넣을 workspace_id 를 먼저 받는다

    room = ChatRoom(workspace_id=ws.id, name="일반", created_by=user.id)
    room.members = [ChatRoomMember(user_id=uid) for uid in member_ids]
    db.add(room)
    db.commit()
    return to_out(ws, user)


@router.patch(
    "/api/workspaces/{workspace_id}",
    response_model=WorkspaceOut,
    summary="활동 수정 (팀장)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def update_workspace(body: WorkspaceUpdate, ws: LeaderWorkspace, db: DB, user: CurrentUser) -> WorkspaceOut:
    """보낸 항목만 바꾼다. 기간은 시작일 ≤ 종료일이어야 한다."""
    changes = body.model_dump(exclude_unset=True)
    for name, value in changes.items():
        setattr(ws, name, value)
    if ws.start_date and ws.end_date and ws.start_date > ws.end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="시작일이 종료일보다 늦을 수 없음")
    db.commit()
    return to_out(ws, user)


@router.put(
    "/api/workspaces/{workspace_id}/members",
    response_model=WorkspaceOut,
    summary="구성원 변경·팀장 위임 (팀장)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def update_members(body: MembersUpdate, ws: LeaderWorkspace, db: DB, user: CurrentUser) -> WorkspaceOut:
    """구성원 명단을 통째로 바꾸고 팀장을 지정한다(위임 포함).

    새 팀장은 반드시 구성원 명단 안에 있어야 한다. 명단에서 빠진 사람은 활동에서 제외되며,
    그 사람이 들어가 있던 채팅방에서도 함께 빠진다.
    """
    member_ids = list(dict.fromkeys(body.member_ids))
    if not member_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="구성원은 최소 1명이어야 함")
    if body.leader_id not in member_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="팀장은 구성원 명단에 있어야 함")
    _check_users_exist(db, member_ids)

    removed = set(ws.member_ids) - set(member_ids)
    existing = {m.user_id: m for m in ws.memberships}
    # 기존 구성원의 가입 시각(joined_at)을 지키기 위해 남는 사람은 그대로 둔다.
    ws.memberships = [existing.get(uid) or WorkspaceMember(user_id=uid) for uid in member_ids]
    ws.leader_id = body.leader_id

    if removed:
        room_ids = select(ChatRoom.id).where(ChatRoom.workspace_id == ws.id)
        db.query(ChatRoomMember).filter(
            ChatRoomMember.room_id.in_(room_ids), ChatRoomMember.user_id.in_(removed)
        ).delete(synchronize_session=False)
    db.commit()
    return to_out(ws, user)


@router.post(
    "/api/workspaces/{workspace_id}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="활동 나가기 (팀원)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def leave_workspace(workspace_id: int, db: DB, user: CurrentUser) -> None:
    """활동에서 스스로 빠진다. 팀장은 먼저 다른 사람에게 위임해야 나갈 수 있다(400)."""
    ws = load_workspace(db, workspace_id)
    if not perm.is_member(ws, user):
        raise forbidden("참여하지 않은 활동임")
    if perm.is_leader(ws, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="팀장은 먼저 다른 구성원에게 위임해야 나갈 수 있음")

    ws.memberships = [m for m in ws.memberships if m.user_id != user.id]
    room_ids = select(ChatRoom.id).where(ChatRoom.workspace_id == ws.id)
    db.query(ChatRoomMember).filter(
        ChatRoomMember.room_id.in_(room_ids), ChatRoomMember.user_id == user.id
    ).delete(synchronize_session=False)
    db.commit()


@router.post(
    "/api/workspaces/{workspace_id}/applications",
    response_model=ApplicationOut,
    status_code=status.HTTP_201_CREATED,
    summary="참가 신청 (미참여자)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
    },
)
def apply_workspace(workspace_id: int, db: DB, user: CurrentUser) -> WorkspaceApplication:
    """참가를 신청한다. 이미 구성원이거나 종료·보관된 활동이면 400, 중복 신청이면 409."""
    ws = load_workspace(db, workspace_id)
    if perm.is_member(ws, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="이미 참여 중인 활동임")
    if not perm.can_apply_workspace(ws, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="종료되었거나 보관된 활동은 신청할 수 없음")

    application = WorkspaceApplication(workspace_id=ws.id, user_id=user.id)
    db.add(application)
    try:
        db.commit()
    except IntegrityError as error:
        # UNIQUE(workspace_id, user_id) 제약이 동시 요청까지 막는다.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="이미 신청한 활동임") from error
    db.refresh(application)
    return application


@router.post(
    "/api/workspaces/{workspace_id}/archive",
    response_model=WorkspaceOut,
    summary="활동 보관 (팀장·임원진)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def archive_workspace(workspace_id: int, db: DB, user: CurrentUser) -> WorkspaceOut:
    """활동을 보관해 목록에서 치운다. 기록은 지우지 않는다.

    실제 삭제(DELETE)를 두지 않은 이유: 회의록·채팅 메시지·예약·일정이 활동에
    ondelete="CASCADE" 로 묶여 있어, 행을 지우면 그 활동에서 오간 기록이 전부 함께
    사라진다. 잘못 만든 활동을 치우려다 회의 기록을 잃는 쪽이 더 큰 손해다.

    보관하면 조회 전용이 되어 일정·회의록·채팅 전송이 모두 막히고(can_write_workspace),
    활동 목록에서는 status 필터로 걸러진다. 되돌리려면 PATCH 로 상태를 바꾸면 된다.
    """
    ws = load_workspace(db, workspace_id)
    if not (perm.is_leader(ws, user) or perm.is_officer(user)):
        raise forbidden("활동 팀장 또는 임원진만 보관할 수 있음")
    if ws.status == perm.ARCHIVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="이미 보관된 활동임")
    ws.status = perm.ARCHIVED
    db.commit()
    return to_out(ws, user)
