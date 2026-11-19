"""FastAPI 애플리케이션 진입점.

실행: uvicorn app.main:app --reload  →  API 문서 http://127.0.0.1:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes import admin, auth, documents, users, workspaces
from app.core.config import settings
from app.db.session import SessionLocal
from app.seed import ensure_initialized

DESCRIPTION = """
CERT-IS 통합 관리 시스템 백엔드 API.

**인증**: `POST /api/auth/login`으로 받은 `accessToken`을 오른쪽 위 **Authorize**에 넣으면
이후 요청에 `Authorization: Bearer <토큰>` 헤더가 붙는다.

**역할**: 임원진(officer) / 일반부원(member). 활동별 팀장·팀원 관계는 역할과 별개로 판단한다.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    """서버가 뜰 때 테이블 생성·샘플 입력을 한 번 시도한다.

    예전에는 Vercel 빌드 단계에서 `python -m app.seed`를 돌렸는데, 그러면 DB가 꺼져 있을 때
    문서만 고친 배포까지 실패했다. 이제는 서버 기동 시 조용히 시도하고, 실패해도 서버는 뜬다.
    """
    ensure_initialized()
    yield


def create_app() -> FastAPI:
    """설정 검사, CORS, 기능별 라우터, 상태 확인 API를 갖춘 FastAPI 앱을 만든다."""
    # 운영 환경 필수 설정(비밀키·DB 주소)을 먼저 확인한 뒤 앱 객체를 만든다.
    settings.check()
    app = FastAPI(title=settings.app_name, version="0.1.0", description=DESCRIPTION, lifespan=lifespan)

    # 허용된 출처(settings.cors_origins)의 프론트엔드가 토큰을 붙여 API를 호출할 수 있게 한다.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # 기능별 라우터 등록: 인증, 사용자, 임원진 계정 관리, 활동, 회의록
    for module in (auth, users, admin, workspaces, documents):
        app.include_router(module.router)

    @app.get("/api/health", tags=["시스템"], summary="서버·DB 상태 확인")
    def health() -> JSONResponse:
        """DB에 가벼운 쿼리를 보내 서버와 DB 연결이 정상인지 확인한다.

        DB가 꺼져 있으면 500(원인을 알 수 없는 오류) 대신 503과 함께 이유를 돌려준다.
        발표 전 점검처럼 "서버는 떴는데 DB만 꺼졌는지"를 한눈에 보려는 용도다.
        """
        try:
            with SessionLocal() as db:
                db.scalar(text("SELECT 1"))
        except SQLAlchemyError as error:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "degraded",
                    "database": "unreachable",
                    "detail": type(error).__name__,
                    "hint": "DB가 꺼져 있을 수 있음. Aiven 콘솔에서 서비스를 다시 켠 뒤 재시도.",
                },
            )
        # DB가 막 켜진 경우 여기서 테이블·샘플이 복구된다.
        ensure_initialized()
        return JSONResponse(content={"status": "ok", "database": "ok"})

    return app


# uvicorn·Vercel이 불러 쓰는 앱 객체(app.main:app)
app = create_app()
