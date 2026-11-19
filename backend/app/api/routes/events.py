"""통합 캘린더: 일정 CRUD와 일정+예약 합본 조회.

일정은 공개 범위(visibility)에 따라 보이는 사람이 다르다.
- club      동아리 전체 일정. 누구나 보고, 임원진만 등록·수정한다(workspace_id 는 NULL).
- workspace 활동 일정. 그 활동 조회 권한자가 보고, 구성원이 수정한다.
- private   개인 일정. 담당자 본인에게만 보인다.

삭제는 행을 지우지 않고 deleted_at 을 기록한다(소프트 삭제). 지워진 일정이
캘린더에서 사라지되 "무엇이 언제 삭제됐는지"는 남는다.
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, forbidden, load_workspace
from app.core import permissions as perm
from app.db.base import utcnow
from app.models import Event, EventAssignee, Reservation, User, Workspace, WorkspaceMember
from app.schemas.common import ErrorOut
from app.schemas.event import CalendarOut, CalendarReservationOut, EventCreate, EventOut, EventUpdate

router = APIRouter(tags=["캘린더"])


def _assignee_ids(db: DB, event_id: int) -> list[int]:
    return list(db.scalars(select(EventAssignee.user_id).where(EventAssignee.event_id == event_id)))


def _to_out(event: Event, assignee_ids: list[int], ws: Workspace | None, user: User) -> EventOut:
    return EventOut.model_validate(
        {
            "id": event.id,
            "workspace_id": event.workspace_id,
            "title": event.title,
            "start_date": event.start_date,
            "end_date": event.end_date,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "visibility": event.visibility,
            "status": event.status,
            "work": event.work,
            "assignee_ids": assignee_ids,
            "created_by": event.created_by,
            "can_edit": perm.can_edit_event(event.visibility, ws, user),
            "updated_at": event.updated_at,
        }
    )


def _check_assignees(db: DB, user_ids: list[int]) -> None:
    if not user_ids:
        return
    found = set(db.scalars(select(User.id).where(User.id.in_(user_ids), User.is_active.is_(True))))
    missing = [uid for uid in user_ids if uid not in found]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"없거나 사용할 수 없는 계정: {missing}")


def _load_event(db: DB, event_id: int) -> tuple[Event, Workspace | None]:
    """삭제되지 않은 일정과 소속 활동을 불러온다. 없거나 이미 삭제됐으면 404."""
    event = db.get(Event, event_id)
    if event is None or event.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="일정을 찾을 수 없음")
    ws = load_workspace(db, event.workspace_id) if event.workspace_id else None
    return event, ws


@router.get(
    "/api/calendar",
    response_model=CalendarOut,
    summary="통합 캘린더 (일정 + 동아리방 예약)",
)
def calendar(
    db: DB,
    user: CurrentUser,
    from_: Annotated[dt.date, Query(alias="from", description="조회 시작일(포함)")],
    to: Annotated[dt.date, Query(description="조회 종료일(포함)")],
    workspace_id: Annotated[int | None, Query(alias="workspaceId", description="특정 활동만")] = None,
    mine: Annotated[bool, Query(description="내가 담당자인 일정만")] = False,
) -> CalendarOut:
    """기간에 걸치는 일정과 그 기간의 예약을 함께 돌려준다.

    볼 수 있는 일정만 추려서 준다. 동아리 전체 일정은 누구나, 활동 일정은 그 활동
    조회 권한자(구성원·임원진), 개인 일정은 담당자 본인만 받는다.
    """
    my_workspace_ids = set(db.scalars(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id)))
    assigned_event_ids = set(db.scalars(select(EventAssignee.event_id).where(EventAssignee.user_id == user.id)))

    # 기간이 겹치는 일정(시작일 <= to AND 종료일 >= from), 삭제된 것 제외
    query = (
        select(Event)
        .where(Event.deleted_at.is_(None), Event.start_date <= to, Event.end_date >= from_)
        .order_by(Event.start_date, Event.start_time)
    )
    if workspace_id is not None:
        query = query.where(Event.workspace_id == workspace_id)
    if mine:
        query = query.where(or_(Event.id.in_(assigned_event_ids), Event.created_by == user.id))

    workspaces: dict[int, Workspace] = {}
    events: list[EventOut] = []
    for event in db.scalars(query):
        ws = None
        if event.workspace_id is not None:
            if event.workspace_id not in workspaces:
                workspaces[event.workspace_id] = db.scalar(
                    select(Workspace)
                    .where(Workspace.id == event.workspace_id)
                    .options(selectinload(Workspace.memberships))
                )
            ws = workspaces[event.workspace_id]
        assignees = _assignee_ids(db, event.id)
        if not perm.can_view_event(event.visibility, assignees, ws, user):
            continue
        events.append(_to_out(event, assignees, ws, user))

    # 확정된 예약만 캘린더에 표시한다. 취소 건은 예약 화면에서만 본다.
    reservation_query = (
        select(Reservation, Workspace)
        .join(Workspace, Workspace.id == Reservation.workspace_id)
        .options(selectinload(Workspace.memberships))
        .where(Reservation.status == "확정", Reservation.date >= from_, Reservation.date <= to)
        .order_by(Reservation.date, Reservation.start_minute)
    )
    if workspace_id is not None:
        reservation_query = reservation_query.where(Reservation.workspace_id == workspace_id)
    if mine:
        reservation_query = reservation_query.where(Reservation.workspace_id.in_(my_workspace_ids))

    reservations = [
        CalendarReservationOut.model_validate(
            {
                "id": r.id,
                "workspace_id": r.workspace_id,
                "workspace_name": ws.name,
                "owner_id": r.owner_id,
                "date": r.date,
                "start_minute": r.start_minute,
                "end_minute": r.end_minute,
                # 예약 API와 같은 규칙으로 다른 팀의 사용 목적은 가린다.
                "purpose": r.purpose if perm.can_view_reservation_detail(ws, user) else None,
            }
        )
        for r, ws in db.execute(reservation_query)
    ]
    return CalendarOut(events=events, reservations=reservations)


@router.post(
    "/api/events",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
    summary="일정 등록",
    responses={status.HTTP_400_BAD_REQUEST: {"model": ErrorOut}, status.HTTP_403_FORBIDDEN: {"model": ErrorOut}},
)
def create_event(body: EventCreate, db: DB, user: CurrentUser) -> EventOut:
    """일정을 만든다. 동아리 전체 일정은 임원진만, 활동·개인 일정은 그 활동 구성원만."""
    ws = load_workspace(db, body.workspace_id) if body.workspace_id else None
    if not perm.can_edit_event(body.visibility, ws, user):
        raise forbidden("동아리 전체 일정은 임원진만, 활동 일정은 그 활동 구성원만 등록할 수 있음")
    _check_assignees(db, body.assignee_ids)

    event = Event(
        workspace_id=body.workspace_id,
        title=body.title,
        start_date=body.start_date,
        end_date=body.end_date,
        start_time=body.start_time,
        end_time=body.end_time,
        visibility=body.visibility,
        status=body.status,
        work=body.work,
        created_by=user.id,
    )
    db.add(event)
    db.flush()
    # 개인 일정에 담당자를 비워 두면 아무에게도 보이지 않으므로 등록자를 담당자로 넣는다.
    assignees = body.assignee_ids or ([user.id] if body.visibility == "private" else [])
    for uid in dict.fromkeys(assignees):
        db.add(EventAssignee(event_id=event.id, user_id=uid))
    db.commit()
    db.refresh(event)
    return _to_out(event, _assignee_ids(db, event.id), ws, user)


@router.patch(
    "/api/events/{event_id}",
    response_model=EventOut,
    summary="일정 수정",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def update_event(event_id: int, body: EventUpdate, db: DB, user: CurrentUser) -> EventOut:
    """보낸 항목만 바꾼다. 공개 범위와 소속 활동은 바꾸지 않는다(권한 경계가 흔들리므로)."""
    event, ws = _load_event(db, event_id)
    if not perm.can_edit_event(event.visibility, ws, user):
        raise forbidden("이 일정을 수정할 권한이 없음")

    changes = body.model_dump(exclude_unset=True)
    assignee_ids = changes.pop("assignee_ids", None)
    for name, value in changes.items():
        setattr(event, name, value)
    if event.start_date > event.end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="시작일이 종료일보다 늦을 수 없음")
    if event.start_date == event.end_date and event.start_time >= event.end_time:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="같은 날이면 시작 시각이 종료 시각보다 빨라야 함")

    if assignee_ids is not None:
        _check_assignees(db, assignee_ids)
        db.query(EventAssignee).filter(EventAssignee.event_id == event.id).delete(synchronize_session=False)
        for uid in dict.fromkeys(assignee_ids):
            db.add(EventAssignee(event_id=event.id, user_id=uid))
    db.commit()
    db.refresh(event)
    return _to_out(event, _assignee_ids(db, event.id), ws, user)


@router.delete(
    "/api/events/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="일정 삭제 (기록을 남기는 소프트 삭제)",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def delete_event(event_id: int, db: DB, user: CurrentUser) -> None:
    """캘린더에서 사라지게 한다. 행은 남고 deleted_at 에 삭제 시각이 기록된다."""
    event, ws = _load_event(db, event_id)
    if not perm.can_edit_event(event.visibility, ws, user):
        raise forbidden("이 일정을 삭제할 권한이 없음")
    event.deleted_at = utcnow()
    db.commit()
