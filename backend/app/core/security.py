"""비밀번호 해시와 JWT 발급·검증.

- 비밀번호: 표준 라이브러리 hashlib.scrypt(솔트 포함)로 해시한다. 원문은 저장하지 않는다.
- 토큰: 로그인 성공 시 HS256으로 서명한 access token을 발급한다.
  토큰에는 사용자 ID(sub)만 신뢰하고, 역할(임원진/일반부원)은 요청마다 DB에서 다시 읽는다.
  그래서 임원진이 역할을 바꾸거나 계정을 비활성화하면 기존 토큰에도 즉시 반영된다.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings

# scrypt 비용 인자(N, r, p)와 결과 길이(바이트). 해시 문자열에 함께 저장되어 검증할 때 그 값을 쓴다.
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _SCRYPT_LEN = 2**14, 8, 1, 64


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    """무작위 솔트로 scrypt 해시를 만들어 `scrypt$N$r$p$솔트$해시` 형식 문자열로 돌려준다."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_LEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    """저장된 해시의 인자·솔트로 입력 비밀번호를 다시 해시해 비교한다. 형식이 잘못된 해시는 False."""
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode("utf-8"), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    # 문자열 비교 시간 차이로 해시 일부가 드러나지 않도록 상수 시간 비교를 사용한다.
    return hmac.compare_digest(actual, expected)


# 존재하지 않는 아이디로 로그인해도 비밀번호 검증 시간을 똑같이 소모해
# 응답 시간만으로 가입된 아이디를 알아낼 수 없게 한다.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def create_access_token(user_id: int, now: datetime | None = None) -> str:
    """사용자 ID와 발급·만료 시각을 담아 서명한 access token을 만든다. now로 발급 시각을 지정할 수 있다."""
    issued = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": issued,
        "exp": issued + timedelta(minutes=settings.access_token_minutes),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    """서명·만료가 올바른 토큰이면 사용자 ID, 아니면 None을 돌려준다."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    try:
        return int(payload["sub"])
    except (TypeError, ValueError):
        return None
