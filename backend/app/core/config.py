"""환경 변수에서 서버 설정을 읽는다.

배포 환경마다 바뀌는 값(DB 주소, JWT 비밀키, 허용 출처)은 코드에 고정하지 않고
환경 변수로 받는다. 값이 없으면 로컬 개발용 기본값을 사용한다.
"""

import os
from dataclasses import dataclass, field

# HS256 키는 32바이트 이상이어야 안전하므로 개발용 기본값도 그 길이를 맞춘다.
DEV_JWT_SECRET = "dev-only-cert-is-secret-change-me-in-production"


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "CERT-IS API"
    env: str = field(default_factory=lambda: os.getenv("APP_ENV", "local"))
    # 로컬 개발은 파일 하나로 동작하는 SQLite, Docker/배포는 MySQL을 사용한다.
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./cert_is.db"))
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", DEV_JWT_SECRET))
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = field(default_factory=lambda: int(os.getenv("ACCESS_TOKEN_MINUTES", "720")))
    # 프론트엔드 개발 서버(vite)가 127.0.0.1:8765에서 실행된다.
    cors_origins: list[str] = field(
        default_factory=lambda: _split(os.getenv("CORS_ORIGINS", "http://127.0.0.1:8765,http://localhost:8765"))
    )

    def check(self) -> None:
        """운영 환경에서 개발용 비밀키로 실행되는 사고를 막는다."""
        if self.env == "production" and (self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret.encode()) < 32):
            raise RuntimeError("운영 환경에서는 32바이트 이상의 JWT_SECRET 환경 변수를 반드시 지정해야 함")


settings = Settings()
