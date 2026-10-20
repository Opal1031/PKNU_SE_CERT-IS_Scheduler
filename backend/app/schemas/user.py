from typing import Annotated, Literal

from pydantic import Field, computed_field

from app.core.permissions import OFFICER
from app.schemas.common import CamelModel, UTCDateTime

Role = Literal["officer", "member"]
Username = Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{3,50}$", description="영문·숫자·_.- 3~50자")]
Password = Annotated[str, Field(min_length=8, max_length=128)]
DisplayName = Annotated[str, Field(min_length=1, max_length=50)]


class UserOut(CamelModel):
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
    username: Username
    name: DisplayName
    password: Password
    role: Role = "member"


class UserUpdate(CamelModel):
    """임원진이 다른 계정의 이름·역할·활성 여부를 바꿀 때 사용. 보낸 필드만 변경."""

    name: DisplayName | None = None
    role: Role | None = None
    is_active: bool | None = None


class PasswordChange(CamelModel):
    current_password: Annotated[str, Field(max_length=128)]
    new_password: Password
