"""동아리방 예약 조회·신청·변경·취소 (WBS 7.1).

중복 예약은 애플리케이션 코드로 "겹치는지 확인한 뒤 저장"하지 않는다. 두 사람이 동시에
같은 시간을 누르면 확인과 저장 사이에 끼어들 수 있기 때문이다. 대신 ReservationSlot 의
(date, slot) 복합 기본키에 30분 슬롯 행을 함께 넣어 DB가 중복을 막게 한다.
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, forbidden, load_workspace
from app.core import permissions as perm
from app.models import Reservation, ReservationSlot, User, Workspace
from app.models.schedule import SLOT_MINUTES
from app.schemas.common import ErrorOut
from app.schemas.reservation import ReservationCancel, ReservationCreate, ReservationOut, ReservationUpdate

router = APIRouter(tags=["동아리방 예약"])

TAKEN = "이미 예약된 시간이 포함되어 있음"


def _slots(start_minute: int, end_minute: int) -> list[int]:
    """시간 구간을 30분 슬롯 번호 목록으로 바꾼다."""
    return list(range(start_minute // SLOT_MINUTES, end_minute // SLOT_MINUTES))


def _occupy(db: DB, reservation: Reservation) -> None:
    """예약이 차지하는 슬롯 행을 넣는다. 이미 누가 점유했으면 409로 바꿔 올린다."""
    for slot in _slots(reservation.start_minute, reservation.end_minute):
        db.add(ReservationSlot(date=reservation.date, slot=slot, reservation_id=reservation.id))
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=TAKEN) from error


def _release(db: DB, reservation: Reservation) -> None:
    """예약이 점유한 슬롯을 해제한다. 예약 행 자체는 기록으로 남긴다."""
    db.query(ReservationSlot).filter(ReservationSlot.reservation_id == reservation.id).delete(
        synchronize_session=False
    )


def _to_out(reservation: Reservation, ws: Workspace, user: User) -> ReservationOut:
    """사용 목적은 그 활동의 구성원·임원진에게만 보여 준다."""
    detailed = perm.can_view_reservation_detail(ws, user)
    return ReservationOut.model_validate(
        {
            "id": reservation.id,
            "workspace_id": reservation.workspace_id,
            "workspace_name": ws.name,
            "owner_id": reservation.owner_id,
            "date": reservation.date,
            "start_minute": reservation.start_minute,
            "end_minute": reservation.end_minute,
            "purpose": reservation.purpose if detailed else None,
            "status": reservation.status,
            "cancel_reason": reservation.cancel_reason if detailed else None,
            "can_edit": perm.can_edit_reservation(reservation.owner_id, ws, user),
            "updated_at": reservation.updated_at,
        }
    )


def _load(db: DB, reservation_id: int) -> tuple[Reservation, Workspace]:
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="예약을 찾을 수 없음")
    return reservation, load_workspace(db, reservation.workspace_id)


@router.get(
    "/api/reservations",
    response_model=list[ReservationOut],
    summary="예약 현황 조회",
)
def list_reservations(
    db: DB,
    user: CurrentUser,
    from_: Annotated[dt.date, Query(alias="from", description="조회 시작일(포함)")],
    to: Annotated[dt.date, Query(description="조회 종료일(포함)")],
    include_cancelled: Annotated[bool, Query(alias="includeCancelled", description="취소 건 포함")] = False,
) -> list[ReservationOut]:
    """기간 안의 예약을 돌려준다. 다른 활동 예약은 시간만 보이고 사용 목적은 가려진다."""
    query = (
        select(Reservation, Workspace)
        .join(Workspace, Workspace.id == Reservation.workspace_id)
        .options(selectinload(Workspace.memberships))
        .where(Reservation.date >= from_, Reservation.date <= to)
        .order_by(Reservation.date, Reservation.start_minute)
    )
    if not include_cancelled:
        query = query.where(Reservation.status == "확정")
    return [_to_out(reservation, ws, user) for reservation, ws in db.execute(query)]


@router.post(
    "/api/reservations",
    response_model=ReservationOut,
    status_code=status.HTTP_201_CREATED,
    summary="예약 신청",
    responses={
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
    },
)
def create_reservation(body: ReservationCreate, db: DB, user: CurrentUser) -> ReservationOut:
    """활동 이름으로 동아리방을 예약한다. 시간이 겹치면 409."""
    ws = load_workspace(db, body.workspace_id)
    if not perm.can_reserve_for(ws, user):
        raise forbidden("활동 구성원 또는 임원진만 예약할 수 있음")

    reservation = Reservation(
        workspace_id=ws.id,
        owner_id=user.id,
        date=body.date,
        start_minute=body.start_minute,
        end_minute=body.end_minute,
        purpose=body.purpose,
        updated_by=user.id,
    )
    db.add(reservation)
    db.flush()  # 슬롯 행이 참조할 reservation.id 를 먼저 받는다
    _occupy(db, reservation)
    db.commit()
    db.refresh(reservation)
    return _to_out(reservation, ws, user)


@router.patch(
    "/api/reservations/{reservation_id}",
    response_model=ReservationOut,
    summary="예약 변경",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
        status.HTTP_409_CONFLICT: {"model": ErrorOut},
    },
)
def update_reservation(reservation_id: int, body: ReservationUpdate, db: DB, user: CurrentUser) -> ReservationOut:
    """시간이나 목적을 바꾼다. 시간을 바꾸면 기존 슬롯을 놓고 새 시간을 다시 점유한다."""
    reservation, ws = _load(db, reservation_id)
    if not perm.can_edit_reservation(reservation.owner_id, ws, user):
        raise forbidden("예약자 본인, 활동 팀장, 임원진만 변경할 수 있음")
    if reservation.status == "취소":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="취소된 예약은 변경할 수 없음")

    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    moved = {"date", "start_minute", "end_minute"} & changes.keys()
    if moved:
        # 겹침 검사를 DB에 맡기기 위해, 기존 점유를 먼저 놓고 새 시간을 잡는다.
        _release(db, reservation)
        db.flush()
    for name, value in changes.items():
        setattr(reservation, name, value)
    if reservation.start_minute >= reservation.end_minute:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="시작 시각이 종료 시각보다 빠를 수 없음")
    if moved:
        _occupy(db, reservation)

    reservation.updated_by = user.id
    db.commit()
    db.refresh(reservation)
    return _to_out(reservation, ws, user)


@router.post(
    "/api/reservations/{reservation_id}/cancel",
    response_model=ReservationOut,
    summary="예약 취소",
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorOut},
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
    },
)
def cancel_reservation(reservation_id: int, body: ReservationCancel, db: DB, user: CurrentUser) -> ReservationOut:
    """예약을 취소한다. 시간 점유는 바로 풀리고, 누가 왜 취소했는지는 기록으로 남는다."""
    reservation, ws = _load(db, reservation_id)
    if not perm.can_edit_reservation(reservation.owner_id, ws, user):
        raise forbidden("예약자 본인, 활동 팀장, 임원진만 취소할 수 있음")
    if reservation.status == "취소":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="이미 취소된 예약임")

    _release(db, reservation)
    reservation.status = "취소"
    reservation.cancel_reason = body.reason
    reservation.updated_by = user.id
    db.commit()
    db.refresh(reservation)
    return _to_out(reservation, ws, user)
