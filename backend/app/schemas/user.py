"""사용자 계정 관련 요청·응답 스키마(회원가입, 계정 관리, 비밀번호 변경)."""

from typing import Annotated, Literal

from pydantic import Field, computed_field

from app.core.permissions import OFFICER
from app.schemas.common import CamelModel, UTCDateTime

# 여러 스키마가 함께 쓰는 필드 타입과 입력 검증 규칙
Role = Literal["officer", "member"]
Username = Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{3,50}$", description="영문·숫자·_.- 3~50자")]
Password = Annotated[str, Field(min_length=8, max_length=128)]
DisplayName = Annotated[str, Field(min_length=1, max_length=50)]


class UserOut(CamelModel):
    """계정 정보 응답. 비밀번호 해시는 포함하지 않는다."""

    id: int
    username: str
    name: str
    role: Role
    is_active: bool
    created_at: UTCDateTime

    @computed_field  # type: ignore[prop-decorator]  # 프론트 Session 타입의 officer 값과 맞춘다.
    @property
    def officer(self) -> bool:
        return self.role == OFFICER


class UserBrief(CamelModel):
    """구성원·담당자 선택 목록용(로그인 사용자 누구나 조회)."""

    id: int
    name: str


class UserCreate(CamelModel):
    """임원진이 계정을 발급할 때 사용. 역할을 지정하지 않으면 일반부원."""

    username: Username
    name: DisplayName
    password: Password
    role: Role = "member"


class SignupRequest(CamelModel):
    """회원가입. 역할은 항상 일반부원이고, 임원진이 승인(로그인 허용)해야 로그인할 수 있다."""

    username: Username
    name: DisplayName
    password: Password


class UserUpdate(CamelModel):
    """임원진이 계정의 아이디·이름·역할·활성 여부를 바꿀 때 사용. 보낸 필드만 변경."""

    username: Username | None = None
    name: DisplayName | None = None
    role: Role | None = None
    is_active: bool | None = None


class PasswordReset(CamelModel):
    """임원진이 비밀번호를 잊은 부원에게 새 비밀번호를 정해 줄 때 사용."""

    new_password: Password


class PasswordChange(CamelModel):
    """본인 비밀번호 변경. 현재 비밀번호가 맞아야 새 비밀번호로 바뀐다."""

    current_password: Annotated[str, Field(max_length=128)]
    new_password: Password
