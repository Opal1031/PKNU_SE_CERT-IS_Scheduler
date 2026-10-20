"""활동(프로젝트·스터디) 조회.

권한 관리(WBS 4.1)를 검증하기 위한 조회 API만 둔다.
등록·수정·필터(WBS 5.1)는 이 파일에 이어서 추가하며, 변경 API는 deps의
WritableWorkspace(구성원) / LeaderWorkspace(팀장) 의존성을 그대로 사용하면 된다.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, ViewableWorkspace, forbidden
from app.core import permissions as perm
from app.models import User, Workspace, WorkspaceMember
from app.schemas.common import ErrorOut
from app.schemas.workspace import PublicWorkspaceOut, WorkspaceOut

router = APIRouter(tags=["활동"])


def to_out(ws: Workspace, user: User) -> WorkspaceOut:
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
    summary="활동 목록",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}},
)
def list_workspaces(
    db: DB,
    user: CurrentUser,
    scope: Annotated[
        Literal["mine", "all"], Query(description="mine=내가 참여한 활동, all=전체 활동(임원진 전용)")
    ] = "mine",
) -> list[WorkspaceOut]:
    query = select(Workspace).options(selectinload(Workspace.memberships)).order_by(Workspace.id)
    if scope == "all":
        if not perm.is_officer(user):
            raise forbidden("전체 활동 운영 조회는 임원진만 가능함")
    else:
        query = query.where(
            Workspace.id.in_(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id))
        )
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
