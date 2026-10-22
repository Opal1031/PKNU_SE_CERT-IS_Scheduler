"""로그인 요청·응답 스키마."""

from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.user import UserOut


class LoginRequest(CamelModel):
    """로그인 요청. 아이디 형식은 검사하지 않고 길이만 제한한다."""

    # 프론트 로그인 폼의 maxLength(아이디 100, 비밀번호 128)와 맞춘다.
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(CamelModel):
    """로그인 성공 응답: access token, 유효 시간, 로그인한 사용자 정보."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # 초 단위
    user: UserOut
