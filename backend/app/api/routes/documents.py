"""회의록 불러오기·저장·버전 이력 (WBS 5.3).

회의록은 채팅방과 1:1이다. 방에서 나눈 대화를 그 자리에서 정리하려는 구조라
별도 식별자 없이 roomId로 접근한다.

여러 사람이 같은 회의록을 동시에 고칠 수 있으므로 낙관적 잠금을 쓴다.
불러올 때 받은 version을 저장할 때 baseVersion으로 돌려보내고, 그 사이 다른 사람이
저장했으면 409로 거부한다. 거부할 때 현재 내용을 함께 주어 화면이 비교·병합할 수 있게 한다.
"""

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, ReadableRoom, WritableRoom
from app.models import Document, DocumentVersion
from app.schemas.common import ErrorOut
from app.schemas.document import DocumentConflictOut, DocumentOut, DocumentSave, DocumentVersionOut

router = APIRouter(tags=["회의록"])

# 버전 이력은 화면에서 되돌리기 후보로만 쓰므로 최근 것만 돌려준다.
VERSION_LIMIT = 10


def _get_document(db: DB, room_id: int) -> Document | None:
    return db.scalar(select(Document).where(Document.room_id == room_id))


def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut.model_validate(
        {
            "room_id": doc.room_id,
            "body": doc.body,
            "version": doc.version,
            "updated_by": doc.updated_by,
            "updated_at": doc.updated_at,
        }
    )


@router.get(
    "/api/rooms/{room_id}/document",
    response_model=DocumentOut,
    summary="회의록 불러오기",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def get_document(room: ReadableRoom, db: DB, user: CurrentUser) -> DocumentOut:
    """방의 회의록을 돌려준다.

    아직 한 번도 저장하지 않은 방이면 빈 회의록(version 1)을 만들어 돌려준다.
    화면이 "없음"과 "빈 내용"을 구분하지 않아도 되게 하기 위함이다.
    """
    doc = _get_document(db, room.id)
    if doc is None:
        doc = Document(room_id=room.id, body="", version=1, updated_by=user.id)
        db.add(doc)
        db.commit()
        db.refresh(doc)
    return _to_out(doc)


@router.put(
    "/api/rooms/{room_id}/document",
    response_model=DocumentOut,
    summary="회의록 저장",
    responses={
        status.HTTP_403_FORBIDDEN: {"model": ErrorOut},
        status.HTTP_404_NOT_FOUND: {"model": ErrorOut},
        status.HTTP_409_CONFLICT: {"model": DocumentConflictOut},
    },
)
def save_document(body: DocumentSave, room: WritableRoom, db: DB, user: CurrentUser):
    """회의록을 저장하고 version을 1 올린다.

    baseVersion이 현재 version과 다르면 저장하지 않고 409와 함께 현재 내용을 돌려준다.
    저장 직전 본문은 DocumentVersion에 남겨 되돌릴 수 있게 한다.
    """
    doc = _get_document(db, room.id)
    if doc is None:
        # 불러오기를 거치지 않고 바로 저장한 경우. 빈 회의록을 먼저 만들고 아래 저장 경로를 그대로 탄다.
        # (여기서 version을 올리지 않고 끝내면 이후 저장이 모두 409가 되므로 경로를 하나로 맞춘다.)
        doc = Document(room_id=room.id, body="", version=1, updated_by=user.id)
        db.add(doc)
        db.flush()

    if body.base_version != doc.version:
        # 덮어쓰지 않고 현재 상태를 함께 알려 화면이 비교·병합할 수 있게 한다.
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=DocumentConflictOut.model_validate(
                {
                    "detail": "다른 사람이 먼저 저장함. 최신 내용을 확인하고 다시 저장해야 함",
                    "current_version": doc.version,
                    "current_body": doc.body,
                    "updated_by": doc.updated_by,
                    "updated_at": doc.updated_at,
                }
            ).model_dump(by_alias=True, mode="json"),
        )

    # 저장 직전 본문을 이력으로 남긴 뒤 새 내용으로 바꾼다.
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=doc.version,
            body=doc.body,
            updated_by=doc.updated_by,
            updated_at=doc.updated_at,
        )
    )
    doc.body = body.body
    doc.version += 1
    doc.updated_by = user.id
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.get(
    "/api/rooms/{room_id}/document/versions",
    response_model=list[DocumentVersionOut],
    summary="회의록 버전 이력 (최근 10개)",
    responses={status.HTTP_403_FORBIDDEN: {"model": ErrorOut}, status.HTTP_404_NOT_FOUND: {"model": ErrorOut}},
)
def list_versions(room: ReadableRoom, db: DB) -> list[DocumentVersion]:
    """저장할 때마다 쌓인 직전 본문을 최신순으로 돌려준다. 회의록이 없으면 빈 목록."""
    doc = _get_document(db, room.id)
    if doc is None:
        return []
    query = (
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc.id)
        .order_by(DocumentVersion.version.desc())
        .limit(VERSION_LIMIT)
    )
    return list(db.scalars(query))
