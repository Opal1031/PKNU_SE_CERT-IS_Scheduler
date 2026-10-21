"""환경 변수에서 서버 설정을 읽는다.

배포 환경마다 바뀌는 값(DB 주소, JWT 비밀키, 허용 출처)은 코드에 고정하지 않고
환경 변수로 받는다. 값이 없으면 로컬 개발용 기본값을 사용한다.
"""

import os
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# HS256 키는 32바이트 이상이어야 안전하므로 개발용 기본값도 그 길이를 맞춘다.
DEV_JWT_SECRET = "dev-only-cert-is-secret-change-me-in-production"
# MySQL 클라이언트의 ssl-mode 값 중 암호화 연결을 요구하는 값
TLS_MODES = {"REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"}


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_database_url(url: str) -> tuple[str, bool]:
    """호스팅 DB가 주는 접속 주소를 SQLAlchemy(PyMySQL) 형식으로 바꾸고 TLS 필요 여부를 함께 돌려준다.

    Aiven 같은 서비스는 `mysql://user:pw@host:port/db?ssl-mode=REQUIRED` 형태로 주소를 준다.
    PyMySQL은 ssl-mode 인자를 모르므로 빼고, 대신 TLS 연결 여부로 넘긴다. MySQL이 아니면 그대로 둔다.
    """
    parts = urlsplit(url)
    if parts.scheme not in ("mysql", "mysql+pymysql"):
        return url, False
    tls = False
    query: list[tuple[str, str]] = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key.lower().replace("_", "-") == "ssl-mode":
            tls = value.upper() in TLS_MODES
        else:
            query.append((key, value))
    if not any(key == "charset" for key, _ in query):
        query.append(("charset", "utf8mb4"))
    return urlunsplit(("mysql+pymysql", parts.netloc, parts.path, urlencode(query), parts.fragment)), tls


def _pem(value: str | None) -> str | None:
    # 환경 변수에 줄바꿈을 \n 문자로 넣은 경우도 인증서로 읽을 수 있게 한다.
    return value.replace("\\n", "\n").strip() if value and value.strip() else None


@dataclass(frozen=True)
class Settings:
    app_name: str = "CERT-IS API"
    env: str = field(default_factory=lambda: os.getenv("APP_ENV", "local"))
    # 로컬 개발은 파일 하나로 동작하는 SQLite, Docker/배포는 MySQL을 사용한다.
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./cert_is.db"))
    # 호스팅 DB의 CA 인증서(PEM). 지정하면 이 인증서로 서버를 검증하는 TLS 연결을 사용한다.
    database_ssl_ca: str | None = field(default_factory=lambda: _pem(os.getenv("DATABASE_SSL_CA")))
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", DEV_JWT_SECRET))
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = field(default_factory=lambda: int(os.getenv("ACCESS_TOKEN_MINUTES", "720")))
    # 프론트엔드 개발 서버(vite)가 127.0.0.1:8765에서 실행된다.
    cors_origins: list[str] = field(
        default_factory=lambda: _split(os.getenv("CORS_ORIGINS", "http://127.0.0.1:8765,http://localhost:8765"))
    )

    def check(self) -> None:
        """운영 환경에서 개발용 비밀키나 임시 SQLite 파일로 실행되는 사고를 막는다."""
        if self.env != "production":
            return
        if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret.encode()) < 32:
            raise RuntimeError("운영 환경에서는 32바이트 이상의 JWT_SECRET 환경 변수를 반드시 지정해야 함")
        if self.database_url.startswith("sqlite"):
            raise RuntimeError("운영 환경에서는 DATABASE_URL 환경 변수로 MySQL 주소를 반드시 지정해야 함")


settings = Settings()
