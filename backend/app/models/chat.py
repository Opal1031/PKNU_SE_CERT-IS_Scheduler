"""활동 내부 채팅방·메시지·태그와 방에 연결된 회의록(Markdown)."""

import datetime as dt

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, BigId, CreatedAtMixin, utcnow

# 회의록은 길어질 수 있어 MySQL에서는 16MB까지 저장하는 MEDIUMTEXT를 쓴다.
LongText = Text().with_variant(MEDIUMTEXT(), "mysql")


class ChatRoom(CreatedAtMixin, Base):
    """한 활동 안에 여러 방을 만들 수 있고, 방마다 참여자를 따로 구성한다."""

    __tablename__ = "chat_rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)  # 보관: 목록에서 숨기고 전송 차단
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class ChatRoomMember(Base):
    __tablename__ = "chat_room_members"

    room_id: Mapped[int] = mapped_column(ForeignKey("chat_rooms.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    last_read_message_id: Mapped[int | None] = mapped_column(BigId)  # 미확인 메시지 표시용


class Message(CreatedAtMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_room_id_id", "room_id", "id"),)  # 방별 최근 메시지·이전 메시지 조회

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("chat_rooms.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)


class TagGroup(Base):
    """활동별 태그 그룹(예: 주차, 주제). position으로 순서를 유지한다."""

    __tablename__ = "tag_groups"
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(50))
    position: Mapped[int] = mapped_column(default=0)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("group_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("tag_groups.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(50))
    position: Mapped[int] = mapped_column(default=0)


# 채팅방 ↔ 태그 다대다 연결 테이블
chat_room_tags = Table(
    "chat_room_tags",
    Base.metadata,
    Column("room_id", Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Document(Base):
    """채팅방과 1:1로 연결된 회의록.

    저장 API는 요청의 baseVersion과 현재 version이 다르면 409로 거부해
    다른 사람이 먼저 저장한 내용을 덮어쓰지 않는다(낙관적 잠금).
    """

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("chat_rooms.id", ondelete="CASCADE"), unique=True)
    body: Mapped[str] = mapped_column(LongText, default="")
    version: Mapped[int] = mapped_column(default=1)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class DocumentVersion(Base):
    """저장할 때마다 직전 본문을 남겨 버전 비교·복원에 사용한다."""

    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    version: Mapped[int]
    body: Mapped[str] = mapped_column(LongText)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime)
