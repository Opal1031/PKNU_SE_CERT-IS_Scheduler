from app.core.config import _pem, normalize_database_url


def test_hosted_mysql_uri_becomes_pymysql_with_tls():
    url, tls = normalize_database_url("mysql://avnadmin:p%40ss@db.example.com:12345/defaultdb?ssl-mode=REQUIRED")
    assert tls is True
    assert url == "mysql+pymysql://avnadmin:p%40ss@db.example.com:12345/defaultdb?charset=utf8mb4"


def test_existing_pymysql_url_is_kept():
    original = "mysql+pymysql://certis:certis@db:3306/certis?charset=utf8mb4"
    assert normalize_database_url(original) == (original, False)


def test_disabled_ssl_mode_means_plain_connection():
    url, tls = normalize_database_url("mysql://u:p@h:3306/d?ssl_mode=DISABLED&connect_timeout=5")
    assert tls is False
    assert url == "mysql+pymysql://u:p@h:3306/d?connect_timeout=5&charset=utf8mb4"


def test_non_mysql_url_is_untouched():
    assert normalize_database_url("sqlite:///./cert_is.db") == ("sqlite:///./cert_is.db", False)


def test_pem_accepts_escaped_newlines():
    assert _pem("-----BEGIN-----\\nabc\\n-----END-----\n") == "-----BEGIN-----\nabc\n-----END-----"
    assert _pem("  ") is None and _pem(None) is None


def test_engine_uses_pymysql_without_ssl_mode_argument():
    from app.db.session import make_engine

    engine = make_engine("mysql://u:p@h:3306/d?ssl-mode=REQUIRED")
    assert engine.url.drivername == "mysql+pymysql"
    assert dict(engine.url.query) == {"charset": "utf8mb4"}


def test_pyproject_dependencies_match_requirements():
    """Vercel(pyproject.toml)과 Docker·CI(requirements.txt)가 같은 버전을 설치해야 한다."""
    import tomllib
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    declared = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))["project"]["dependencies"]
    lines = (root / "requirements.txt").read_text(encoding="utf-8").splitlines()
    required = [line.strip() for line in lines if line.strip() and not line.startswith("#")]
    assert sorted(declared) == sorted(required)


def test_production_requires_secret_and_database():
    import pytest

    from app.core.config import DEV_JWT_SECRET, Settings

    secret, mysql = "x" * 40, "mysql://u:p@h:3306/d?ssl-mode=REQUIRED"
    Settings(env="production", jwt_secret=secret, database_url=mysql).check()
    Settings(env="local", jwt_secret=DEV_JWT_SECRET, database_url="sqlite:///./cert_is.db").check()
    for bad in (
        Settings(env="production", jwt_secret=DEV_JWT_SECRET, database_url=mysql),
        Settings(env="production", jwt_secret="short", database_url=mysql),
        Settings(env="production", jwt_secret=secret, database_url="sqlite:///./cert_is.db"),
    ):
        with pytest.raises(RuntimeError):
            bad.check()
