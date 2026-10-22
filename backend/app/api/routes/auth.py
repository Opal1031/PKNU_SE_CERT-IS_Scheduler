"""회원가입, 로그인과 내 계정 조회."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, USERNAME_TAKEN, CurrentUser, ensure_username_free, forbidden, unauthorized
from app.core.config import settings
from app.core.permissions import MEMBER
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.models import AuditLog, User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import ErrorOut
from app.schemas.user import SignupRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["인증"])


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입 (임원진 승인 후 로그인)",
    responses={status.HTTP_409_CONFLICT: {"model": ErrorOut}},
)
def signup(body: SignupRequest, db: DB) -> User:
    """일반부원 계정을 승인 대기(로그인 차단) 상태로 만든다.

    공개 사이트라 누구나 가입할 수 있으므로, 임원진이 계정 관리에서 로그인을 허용해야 로그인된다.
    역할은 요청 값과 관계없이 항상 일반부원이다.
    """
    ensure_username_free(db, body.username)
    user = User(
        username=body.username,
        name=body.name,
        role=MEMBER,
        is_active=False,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN) from None
    db.add(AuditLog(user_id=user.id, action="회원가입 신청", target_type="user", target_id=str(user.id)))
    db.commit()
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="로그인",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut}, status.HTTP_403_FORBIDDEN: {"model": ErrorOut}},
)
def login(body: LoginRequest, db: DB) -> TokenResponse:
    """아이디·비밀번호를 확인하고 access token(JWT)을 발급한다.

    이후 요청은 `Authorization: Bearer <accessToken>` 헤더를 붙인다.
    로그아웃은 서버 상태가 없으므로 프론트엔드가 토큰을 지우면 된다.
    """
    user = db.scalar(select(User).where(User.username == body.username))
    # 아이디가 없어도 같은 시간만큼 해시 검증을 수행해 아이디 존재 여부가 드러나지 않게 한다.
    valid = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise unauthorized("아이디 또는 비밀번호가 올바르지 않음")
    if not user.is_active:
        raise forbidden("가입 승인 대기 중이거나 비활성화된 계정임. 운영진에게 문의해야 함")
    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="내 계정 정보",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": ErrorOut}},
)
def me(user: CurrentUser) -> User:
    """새로고침 후 토큰이 아직 유효한지, 내 역할(임원진/일반부원)이 무엇인지 확인한다."""
    return user
