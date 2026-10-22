"""임원진 전용 계정 관리. /api/admin/* 은 모두 임원진(officer)만 호출할 수 있다."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import DB, USERNAME_TAKEN, Officer, ensure_username_free
from app.core.security import hash_password
from app.models import AuditLog, User
from app.schemas.common import ErrorOut
from app.schemas.user import PasswordReset, UserCreate, UserOut, UserUpdate

router = APIRouter(
    prefix="/api/admin/users",
    tags=["임원진 · 계정 관리"],
    responses={status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut}, status.HTTP_403_FORBIDDEN: {"model": ErrorOut}},
)


def _audit(db: Session, actor: User, action: str, target: User) -> None:
    db.add(AuditLog(user_id=actor.id, action=action, target_type="user", target_id=str(target.id)))


def _account(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="계정을 찾을 수 없음")
    return user


@router.get("", response_model=list[UserOut], summary="전체 계정 목록(비활성 포함)")
def list_accounts(db: DB, _: Officer) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)))


@router.post(
    "",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="계정 발급",
    responses={status.HTTP_409_CONFLICT: {"model": ErrorOut}},
)
def create_account(body: UserCreate, db: DB, officer: Officer) -> User:
    """임원진이 부원 계정을 바로 발급한다(회원가입과 달리 승인 없이 로그인 가능)."""
    ensure_username_free(db, body.username)
    user = User(username=body.username, name=body.name, role=body.role, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.flush()  # 동시에 같은 아이디로 발급하면 UNIQUE 제약이 막는다.
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN) from None
    _audit(db, officer, "계정 발급", user)
    db.commit()
    return user


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    summary="아이디·이름·역할·활성 여부 변경 (가입 승인 포함)",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
    },
)
def update_account(user_id: int, body: UserUpdate, db: DB, officer: Officer) -> User:
    user = _account(db, user_id)
    changes = body.model_dump(exclude_unset=True)
    # 마지막 임원이 스스로 권한을 내려놓아 아무도 관리할 수 없게 되는 상황을 막는다.
    if user.id == officer.id and (changes.get("role") == "member" or changes.get("is_active") is False):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="자기 자신의 임원 권한 해제·비활성화는 다른 임원진이 해야 함"
        )
    if changes.get("username"):
        # 토큰에는 계정 번호만 들어 있어 아이디를 바꿔도 로그인 상태는 유지된다.
        ensure_username_free(db, changes["username"], user.id)
    for key, value in changes.items():
        if value is not None:
            setattr(user, key, value)
    _audit(db, officer, "계정 변경", user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN) from None
    return user


@router.put(
    "/{user_id}/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="비밀번호 초기화",
    responses={status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def reset_password(user_id: int, body: PasswordReset, db: DB, officer: Officer) -> None:
    """비밀번호를 잊은 부원에게 임원진이 새 비밀번호를 정해 준다(로그인 화면 안내: 비밀번호 문의는 운영진에게)."""
    user = _account(db, user_id)
    user.password_hash = hash_password(body.new_password)
    _audit(db, officer, "비밀번호 초기화", user)
    db.commit()
