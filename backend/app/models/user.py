from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.permissions import MEMBER, ROLES
from app.db.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    """동아리 계정. 회원가입 없이 임원진이 계정을 발급한다."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)  # 로그인 아이디
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50))  # 화면 표시 이름
    role: Mapped[str] = mapped_column(Enum(*ROLES, name="user_role"), default=MEMBER)  # officer=임원진, member=일반부원
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # 탈퇴·정지 시 로그인 차단
