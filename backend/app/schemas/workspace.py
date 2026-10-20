import datetime as dt
from typing import Literal

from app.schemas.common import CamelModel, UTCDateTime

MyRole = Literal["leader", "member", "viewer"]  # 팀장 / 팀원 / 미참여(임원진 운영 조회)


class PublicWorkspaceOut(CamelModel):
    """비로그인 '진행 중인 활동' 화면용. 구성원·일정 같은 내부 정보는 빼고 소개만 공개한다."""

    id: int
    type: Literal["project", "study"]
    name: str
    initial: str
    field: str
    status: str
    goal: str


class WorkspaceOut(PublicWorkspaceOut):
    start_date: dt.date | None
    end_date: dt.date | None
    leader_id: int
    created_by: int
    member_ids: list[int]
    updated_at: UTCDateTime
    my_role: MyRole
