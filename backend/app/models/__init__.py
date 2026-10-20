"""모든 모델을 한곳에서 불러와 Base.metadata에 전체 테이블이 등록되게 한다."""

from app.models.chat import ChatRoom, ChatRoomMember, Document, DocumentVersion, Message, Tag, TagGroup, chat_room_tags
from app.models.misc import AuditLog, SurveyResult
from app.models.schedule import Event, EventAssignee, Reservation, ReservationSlot
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceApplication, WorkspaceMember

__all__ = [
    "AuditLog",
    "ChatRoom",
    "ChatRoomMember",
    "Document",
    "DocumentVersion",
    "Event",
    "EventAssignee",
    "Message",
    "Reservation",
    "ReservationSlot",
    "SurveyResult",
    "Tag",
    "TagGroup",
    "User",
    "Workspace",
    "WorkspaceApplication",
    "WorkspaceMember",
    "chat_room_tags",
]
