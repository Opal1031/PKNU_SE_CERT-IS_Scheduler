"""FastAPI 애플리케이션 진입점.

실행: uvicorn app.main:app --reload  →  API 문서 http://127.0.0.1:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.deps import DB
from app.api.routes import admin, auth, users, workspaces
from app.core.config import settings

DESCRIPTION = """
CERT-IS 통합 관리 시스템 백엔드 API.

**인증**: `POST /api/auth/login`으로 받은 `accessToken`을 오른쪽 위 **Authorize**에 넣으면
이후 요청에 `Authorization: Bearer <토큰>` 헤더가 붙는다.

**역할**: 임원진(officer) / 일반부원(member). 활동별 팀장·팀원 관계는 역할과 별개로 판단한다.
"""


def create_app() -> FastAPI:
    settings.check()
    app = FastAPI(title=settings.app_name, version="0.1.0", description=DESCRIPTION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    for module in (auth, users, admin, workspaces):
        app.include_router(module.router)

    @app.get("/api/health", tags=["시스템"], summary="서버·DB 상태 확인")
    def health(db: DB) -> dict[str, str]:
        db.scalar(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
