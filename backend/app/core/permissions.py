"""권한 판단 규칙(정책).

권한은 두 축으로 나뉜다.
1) 동아리 역할: 임원진(officer) / 일반부원(member) — users.role
2) 활동별 관계: 팀장 / 팀원 / 미참여 — workspaces.leader_id, workspace_members

두 축은 서로 독립이다. 예) 일반부원도 자기가 만든 활동에서는 팀장이고,
임원진이라도 참여하지 않은 활동에서는 팀원 권한(채팅 전송·문서 수정)이 없다.

이 모듈은 DB·웹 프레임워크에 의존하지 않는 순수 함수만 둔다.
API 계층(app/api/deps.py)은 여기 결과에 따라 401/403을 응답하고,
프론트엔드 model.ts의 canView·writable·leader·bookingEditable·eventEditable과 같은 규칙을 따른다.
"""

from collections.abc import Iterable
from typing import Protocol

OFFICER = "officer"
MEMBER = "member"
ROLES = (OFFICER, MEMBER)
ARCHIVED = "보관"
CLOSED_STATUSES = ("완료", ARCHIVED)


class UserLike(Protocol):
    id: int
    role: str


class WorkspaceLike(Protocol):
    leader_id: int
    status: str

    @property
    def member_ids(self) -> Iterable[int]: ...


def is_officer(user: UserLike) -> bool:
    return user.role == OFFICER


def is_member(ws: WorkspaceLike, user: UserLike) -> bool:
    return user.id in set(ws.member_ids)


def is_leader(ws: WorkspaceLike, user: UserLike) -> bool:
    return is_member(ws, user) and ws.leader_id == user.id


def can_view_workspace(ws: WorkspaceLike, user: UserLike) -> bool:
    """활동 상세·팀 캘린더 조회: 구성원 또는 임원진(운영 조회)."""
    return is_member(ws, user) or is_officer(user)


def can_write_workspace(ws: WorkspaceLike, user: UserLike) -> bool:
    """일정·방·회의록 변경: 구성원만. 보관된 활동은 조회 전용."""
    return is_member(ws, user) and ws.status != ARCHIVED


def can_manage_workspace(ws: WorkspaceLike, user: UserLike) -> bool:
    """활동 정보 수정·구성원 변경·팀장 위임: 해당 활동의 팀장만."""
    return is_leader(ws, user)


def can_apply_workspace(ws: WorkspaceLike, user: UserLike) -> bool:
    """참가 신청: 미참여자이고 활동이 종료되지 않았을 때."""
    return not is_member(ws, user) and ws.status not in CLOSED_STATUSES


def can_reserve_for(ws: WorkspaceLike, user: UserLike) -> bool:
    """동아리방 예약 신청: 활동 구성원, 또는 운영 관리를 맡은 임원진."""
    return can_write_workspace(ws, user) or (is_officer(user) and ws.status != ARCHIVED)


def can_edit_reservation(owner_id: int, ws: WorkspaceLike, user: UserLike) -> bool:
    """예약 변경·취소: 예약자 본인, 해당 활동 팀장, 임원진."""
    return owner_id == user.id or is_leader(ws, user) or is_officer(user)


def can_view_reservation_detail(ws: WorkspaceLike, user: UserLike) -> bool:
    """다른 팀 예약은 어느 활동인지 시간만 공개하고, 사용 목적 등 상세는 구성원·임원진에게만 공개."""
    return is_member(ws, user) or is_officer(user)


def can_edit_event(visibility: str, ws: WorkspaceLike | None, user: UserLike) -> bool:
    """동아리 전체 일정은 임원진만, 활동 일정은 그 활동 구성원만 변경."""
    if visibility == "club":
        return is_officer(user)
    return ws is not None and can_write_workspace(ws, user)


def can_view_event(visibility: str, assignee_ids: Iterable[int], ws: WorkspaceLike | None, user: UserLike) -> bool:
    if visibility == "club":
        return True
    if visibility == "private":
        return user.id in set(assignee_ids)
    return ws is not None and can_view_workspace(ws, user)


def can_read_chat(archived: bool, room_member_ids: Iterable[int], ws: WorkspaceLike, user: UserLike) -> bool:
    """채팅 열람: 방에 초대된 활동 구성원만. 임원진의 운영 조회는 대화 내용까지 넓히지 않는다."""
    return not archived and is_member(ws, user) and user.id in set(room_member_ids)


def can_send_chat(archived: bool, room_member_ids: Iterable[int], ws: WorkspaceLike, user: UserLike) -> bool:
    return can_read_chat(archived, room_member_ids, ws, user) and can_write_workspace(ws, user)
