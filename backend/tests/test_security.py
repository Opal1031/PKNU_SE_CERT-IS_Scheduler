"""비밀번호 해시와 access token 발급·검증(만료·변조·위조 토큰 거부) 테스트."""

from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password


def test_password_hash_is_salted_and_verifiable():
    first, second = hash_password("secret-pass"), hash_password("secret-pass")
    assert first != second  # 같은 비밀번호도 솔트가 달라 해시가 다르다
    assert "secret-pass" not in first
    assert verify_password("secret-pass", first)
    assert not verify_password("wrong-pass", first)


def test_verify_rejects_malformed_hash():
    assert not verify_password("x", "not-a-hash")
    assert not verify_password("x", "bcrypt$1$2$3$4$5")


def test_token_round_trip():
    assert decode_access_token(create_access_token(42)) == 42


def test_expired_token_is_rejected():
    issued = datetime.now(UTC) - timedelta(minutes=settings.access_token_minutes + 1)
    assert decode_access_token(create_access_token(1, now=issued)) is None


def test_tampered_or_foreign_token_is_rejected():
    header, payload, signature = create_access_token(1).split(".")
    flipped = signature[:10] + ("A" if signature[10] != "A" else "B") + signature[11:]  # 서명 한 글자 변조
    assert decode_access_token(f"{header}.{payload}.{flipped}") is None
    forged = jwt.encode(
        {
            "sub": "1",
            "type": "access",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "another-secret-key-with-enough-length!!",
        algorithm="HS256",
    )
    assert decode_access_token(forged) is None


def test_token_without_access_type_is_rejected():
    now = datetime.now(UTC)
    other = jwt.encode(
        {"sub": "1", "type": "refresh", "iat": now, "exp": now + timedelta(hours=1)},
        settings.jwt_secret,
        algorithm="HS256",
    )
    assert decode_access_token(other) is None


def test_none_algorithm_is_rejected():
    # 서명 없는 토큰(alg=none)으로 권한을 위조하는 공격을 막는다.
    unsigned = jwt.encode({"sub": "1", "type": "access", "iat": 0, "exp": 9999999999}, None, algorithm="none")
    assert decode_access_token(unsigned) is None
