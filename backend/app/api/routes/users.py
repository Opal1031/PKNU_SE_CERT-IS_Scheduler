"""사용자 목록(구성원 선택용)과 내 비밀번호 변경."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.core.security import hash_password, verify_password
from app.models import User
from app.schemas.common import ErrorOut
from app.schemas.user import PasswordChange, UserBrief

router = APIRouter(prefix="/api/users", tags=["사용자"])


@router.get("", response_model=list[UserBrief], summary="활성 사용자 목록")
def list_users(db: DB, _: CurrentUser) -> list[User]:
    """활동 구성원·일정 담당자를 고를 때 쓰는 이름 목록. 로그인 사용자 누구나 조회한다."""
    return list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name, User.id)))


@router.patch(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="내 비밀번호 변경",
    responses={status.HTTP_400_BAD_REQUEST: {"model": ErrorOut}},
)
def change_password(body: PasswordChange, db: DB, user: CurrentUser) -> None:
    """현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다. 현재 비밀번호가 틀리면 400."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="현재 비밀번호가 올바르지 않음")
    user.password_hash = hash_password(body.new_password)
    db.commit()
