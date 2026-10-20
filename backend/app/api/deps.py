"""라우터에서 공통으로 쓰는 의존성: DB 세션, 로그인 사용자, 권한 검사.

권한 판단 자체는 app.core.permissions의 순수 함수가 하고,
여기서는 그 결과에 따라 HTTP 상태 코드로 바꾼다.
- 401 Unauthorized: 로그인하지 않았거나 토큰이 유효하지 않음
- 403 Forbidden: 로그인은 했지만 해당 동작 권한이 없음
- 404 Not Found: 대상이 없음
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core import permissions as perm
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User, Workspace

# Swagger(/docs)의 Authorize 버튼에 토큰을 붙여 넣어 테스트할 수 있다.
bearer = HTTPBearer(auto_error=False, description="POST /api/auth/login 응답의 accessToken")

DB = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def unauthorized(detail: str = "로그인이 필요함") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def forbidden(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail=detail)


def get_current_user(db: DB, credentials: Credentials) -> User:
    if credentials is None:
        raise unauthorized()
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise unauthorized("토큰이 유효하지 않거나 만료됨. 다시 로그인해야 함")
    # 역할·활성 여부는 토큰이 아니라 DB의 최신 값을 기준으로 판단한다.
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized("사용할 수 없는 계정임")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_officer(user: CurrentUser) -> User:
    if not perm.is_officer(user):
        raise forbidden("임원진만 사용할 수 있는 기능임")
    return user


Officer = Annotated[User, Depends(require_officer)]


def load_workspace(db: Session, workspace_id: int) -> Workspace:
    ws = db.scalar(select(Workspace).where(Workspace.id == workspace_id).options(selectinload(Workspace.memberships)))
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="활동을 찾을 수 없음")
    return ws


def viewable_workspace(workspace_id: int, db: DB, user: CurrentUser) -> Workspace:
    ws = load_workspace(db, workspace_id)
    if not perm.can_view_workspace(ws, user):
        raise forbidden("활동 구성원 또는 임원진만 조회할 수 있음")
    return ws


def writable_workspace(workspace_id: int, db: DB, user: CurrentUser) -> Workspace:
    ws = load_workspace(db, workspace_id)
    if not perm.can_write_workspace(ws, user):
        raise forbidden("활동 구성원만 변경 가능함. 보관 활동은 조회 전용임")
    return ws


def leader_workspace(workspace_id: int, db: DB, user: CurrentUser) -> Workspace:
    ws = load_workspace(db, workspace_id)
    if not perm.can_manage_workspace(ws, user):
        raise forbidden("이 활동의 팀장만 변경 가능함")
    return ws


ViewableWorkspace = Annotated[Workspace, Depends(viewable_workspace)]
WritableWorkspace = Annotated[Workspace, Depends(writable_workspace)]
LeaderWorkspace = Annotated[Workspace, Depends(leader_workspace)]
