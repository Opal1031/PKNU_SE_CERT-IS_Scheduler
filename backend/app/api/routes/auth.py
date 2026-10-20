"""로그인과 내 계정 조회."""

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, forbidden, unauthorized
from app.core.config import settings
from app.core.security import DUMMY_HASH, create_access_token, verify_password
from app.models import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import ErrorOut
from app.schemas.user import UserOut

router = APIRouter(prefix="/api/auth", tags=["인증"])


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
        raise forbidden("비활성화된 계정임. 운영진에게 문의해야 함")
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
