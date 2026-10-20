"""프로젝트·스터디(공통 명칭 Workspace)와 구성원, 참가 신청."""

import datetime as dt

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, utcnow
from app.models.user import User

WORKSPACE_TYPES = ("project", "study")
WORKSPACE_STATUSES = ("계획", "진행 중", "보류", "완료", "보관")
APPLICATION_STATUSES = ("대기", "승인", "거절")


class Workspace(TimestampMixin, Base):
    """프로젝트와 스터디는 화면·기능이 같아 type 컬럼으로만 구분한다."""

    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint("start_date IS NULL OR end_date IS NULL OR start_date <= end_date", name="period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(Enum(*WORKSPACE_TYPES, name="workspace_type"))
    name: Mapped[str] = mapped_column(String(100))
    initial: Mapped[str] = mapped_column(String(4))  # 사이드바 아이콘에 표시할 약칭
    field: Mapped[str] = mapped_column(String(30))  # 보안 분야(웹 보안, 네트워크, 암호학, 시스템 보안 …)
    status: Mapped[str] = mapped_column(Enum(*WORKSPACE_STATUSES, name="workspace_status"), default="계획")
    goal: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[dt.date | None] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    leader_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # 팀장: 생성자가 최초 팀장, 위임 가능
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

    leader: Mapped[User] = relationship(foreign_keys=[leader_id])
    memberships: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        order_by="WorkspaceMember.joined_at, WorkspaceMember.user_id",
    )

    @property
    def member_ids(self) -> list[int]:
        return [m.user_id for m in self.memberships]


class WorkspaceMember(Base):
    """사용자 ↔ 활동 다대다 관계. 팀장도 반드시 구성원으로 들어간다."""

    __tablename__ = "workspace_members"

    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)

    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()


class WorkspaceApplication(Base):
    """미참여 활동 참가 신청. 같은 활동에 중복 신청할 수 없다."""

    __tablename__ = "workspace_applications"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(Enum(*APPLICATION_STATUSES, name="application_status"), default="대기")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
