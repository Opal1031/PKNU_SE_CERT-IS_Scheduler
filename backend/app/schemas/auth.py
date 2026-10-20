from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.user import UserOut


class LoginRequest(CamelModel):
    # 프론트 로그인 폼의 maxLength(아이디 100, 비밀번호 128)와 맞춘다.
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(CamelModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # 초 단위
    user: UserOut
