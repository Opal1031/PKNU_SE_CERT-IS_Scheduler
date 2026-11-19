"""활동(Workspace) 응답 스키마."""

import datetime as dt
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import CamelModel, UTCDateTime

MyRole = Literal["leader", "member", "viewer"]  # 팀장 / 팀원 / 미참여(임원진 운영 조회)
WorkspaceStatus = Literal["계획", "진행 중", "보류", "완료", "보관"]


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
    """로그인 사용자용 활동 응답. 공개 정보에 기간·팀장·구성원과 요청자의 관계(my_role)를 더한다."""

    start_date: dt.date | None
    end_date: dt.date | None
    leader_id: int
    created_by: int
    member_ids: list[int]
    updated_at: UTCDateTime
    my_role: MyRole


class WorkspaceCreate(CamelModel):
    """활동 등록 요청. 생성자가 최초 팀장이 되고 구성원에 함께 들어간다."""

    type: Literal["project", "study"]
    name: str = Field(min_length=1, max_length=100)
    initial: str = Field(min_length=1, max_length=4)
    field: str = Field(min_length=1, max_length=30)
    goal: str = ""
    status: WorkspaceStatus = "계획"
    start_date: dt.date | None = None
    end_date: dt.date | None = None
    member_ids: list[int] = []  # 생성자 외에 처음부터 넣을 구성원

    @model_validator(mode="after")
    def check_period(self) -> "WorkspaceCreate":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("시작일이 종료일보다 늦을 수 없음")
        return self


class WorkspaceUpdate(CamelModel):
    """활동 수정 요청(팀장 전용). 보낸 항목만 바꾼다."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    initial: str | None = Field(default=None, min_length=1, max_length=4)
    field: str | None = Field(default=None, min_length=1, max_length=30)
    goal: str | None = None
    status: WorkspaceStatus | None = None
    start_date: dt.date | None = None
    end_date: dt.date | None = None


class MembersUpdate(CamelModel):
    """구성원 교체와 팀장 위임. leaderId는 반드시 memberIds 안에 있어야 한다."""

    member_ids: list[int]
    leader_id: int


class ApplicationOut(CamelModel):
    """참가 신청 결과."""

    id: int
    workspace_id: int
    user_id: int
    status: Literal["대기", "승인", "거절"]
    created_at: UTCDateTime
