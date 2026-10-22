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

# 라우트 인자 타입으로 쓰는 의존성: 요청 단위 DB 세션, Bearer 토큰(헤더가 없으면 None)
DB = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def unauthorized(detail: str = "로그인이 필요함") -> HTTPException:
    """401 예외를 만든다. Bearer 인증이 필요하다는 WWW-Authenticate 헤더를 함께 보낸다."""
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def forbidden(detail: str) -> HTTPException:
    """403 예외를 만든다(로그인은 했지만 해당 동작 권한이 없음)."""
    return HTTPException(status.HTTP_403_FORBIDDEN, detail=detail)


USERNAME_TAKEN = "이미 사용 중인 아이디임"


def ensure_username_free(db: Session, username: str, user_id: int | None = None) -> None:
    """다른 계정이 쓰는 아이디면 409. 동시에 같은 아이디로 저장하면 UNIQUE 제약이 한 번 더 막는다."""
    owner = db.scalar(select(User.id).where(User.username == username))
    if owner is not None and owner != user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN)


def get_current_user(db: DB, credentials: Credentials) -> User:
    """Bearer 토큰으로 현재 로그인 사용자를 찾는다. 토큰이 없거나 무효이거나 사용할 수 없는 계정이면 401."""
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
    """임원진 전용 기능의 의존성. 일반부원이면 403."""
    if not perm.is_officer(user):
        raise forbidden("임원진만 사용할 수 있는 기능임")
    return user


Officer = Annotated[User, Depends(require_officer)]


def load_workspace(db: Session, workspace_id: int) -> Workspace:
    """권한 판단에 필요한 구성원 목록까지 함께 불러온 활동을 돌려준다. 없으면 404."""
    ws = db.scalar(select(Workspace).where(Workspace.id == workspace_id).options(selectinload(Workspace.memberships)))
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="활동을 찾을 수 없음")
    return ws


def viewable_workspace(workspace_id: int, db: DB, user: CurrentUser) -> Workspace:
    """조회 권한(구성원 또는 임원진)이 있을 때만 활동을 넘겨준다."""
    ws = load_workspace(db, workspace_id)
    if not perm.can_view_workspace(ws, user):
        raise forbidden("활동 구성원 또는 임원진만 조회할 수 있음")
    return ws


def writable_workspace(workspace_id: int, db: DB, user: CurrentUser) -> Workspace:
    """변경 권한(구성원, 보관되지 않은 활동)이 있을 때만 활동을 넘겨준다."""
    ws = load_workspace(db, workspace_id)
    if not perm.can_write_workspace(ws, user):
        raise forbidden("활동 구성원만 변경 가능함. 보관 활동은 조회 전용임")
    return ws


def leader_workspace(workspace_id: int, db: DB, user: CurrentUser) -> Workspace:
    """해당 활동의 팀장일 때만 활동을 넘겨준다."""
    ws = load_workspace(db, workspace_id)
    if not perm.can_manage_workspace(ws, user):
        raise forbidden("이 활동의 팀장만 변경 가능함")
    return ws


# 라우트에서 workspace_id로 활동을 불러오면서 권한까지 검사하는 의존성 타입
ViewableWorkspace = Annotated[Workspace, Depends(viewable_workspace)]
WritableWorkspace = Annotated[Workspace, Depends(writable_workspace)]
LeaderWorkspace = Annotated[Workspace, Depends(leader_workspace)]
