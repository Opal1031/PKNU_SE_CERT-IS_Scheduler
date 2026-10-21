# CERT-IS 백엔드

Python + FastAPI + SQLAlchemy(MySQL) + JWT. API 목록과 권한 규칙은 [docs/backend/API.md](../docs/backend/API.md), 테이블 설계는 [docs/backend/ERD.md](../docs/backend/ERD.md)에 있다.

## 실행 방법

### 1) Docker로 MySQL까지 한 번에 (권장)

저장소 루트에서:

```bash
docker compose up --build
```

- API 문서(Swagger): http://127.0.0.1:8000/docs
- 처음 시작할 때 테이블을 만들고 샘플 계정·활동을 넣는다(이미 있으면 건너뜀).
- 데이터를 처음부터 다시 만들려면 `docker compose down -v` 후 다시 실행.

### 2) Python만으로 빠르게 (SQLite)

Python 3.11 이상.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m app.seed               # cert_is.db 파일에 테이블·샘플 생성
uvicorn app.main:app --reload    # http://127.0.0.1:8000/docs
```

## 샘플 계정

비밀번호는 모두 `certis1234!` (환경 변수 `SEED_PASSWORD`로 변경 가능).

| 아이디 | 이름 | 역할 | 비고 |
|---|---|---|---|
| admin | 운영진 | 임원진 | 계정 관리·전체 활동 조회 가능 |
| demo | 데모 사용자 | 일반부원 | 프론트 샘플의 '나'. CERT-IS 통합 관리 팀장 |
| minseo | 민서 | 일반부원 | 웹 취약점 연구 팀장 |
| gitae, hyelim, jisu, doyun, subin | | 일반부원 | 프론트 `seed.json`과 같은 활동 구성 |

Swagger에서 확인하는 순서: `POST /api/auth/login` 실행 → 응답의 `accessToken` 복사 → 오른쪽 위 **Authorize**에 붙여 넣기 → 다른 API 호출.

## 테스트

```bash
cd backend
pytest            # 메모리 SQLite
ruff check .      # 코드 검사
```

`TEST_DATABASE_URL=mysql+pymysql://...`를 지정하면 같은 테스트를 MySQL에서 실행한다. GitHub Actions(CI)는 SQLite와 MySQL 8.0 두 번 모두 실행한다.

| 파일 | 확인하는 내용 |
|---|---|
| tests/test_security.py | 비밀번호 해시·검증, 토큰 만료·위조·`alg=none` 거부 |
| tests/test_permissions.py | 임원진/일반부원 × 팀장/팀원/미참여 권한 규칙 |
| tests/test_auth_api.py | 로그인, `/me`, 역할 변경·비활성화의 즉시 반영 |
| tests/test_users_api.py | 임원진 전용 계정 관리, 입력 검증, 비밀번호 변경 |
| tests/test_workspaces_api.py | 활동 조회 권한, 구성원/팀장 전용 의존성 |
| tests/test_schema.py | 전체 테이블 등록, MySQL DDL 변환, 예약 슬롯 중복 차단 |
| tests/test_config.py | 호스팅 DB 접속 주소(`ssl-mode`) 변환, CA 인증서 값 읽기 |

## 코드 구조

```text
backend/app
├─ main.py              앱 생성, CORS, 라우터 등록, /api/health
├─ core/
│  ├─ config.py         환경 변수 설정(DATABASE_URL, JWT_SECRET, CORS_ORIGINS …)
│  ├─ security.py       비밀번호 해시(scrypt), JWT 발급·검증
│  └─ permissions.py    권한 규칙(순수 함수) — 프론트 model.ts와 같은 규칙
├─ db/                  SQLAlchemy Base, 엔진·세션
├─ models/              테이블 정의(ERD)
├─ schemas/             요청·응답 형식(Pydantic, camelCase)
├─ api/
│  ├─ deps.py           로그인 사용자·임원진·활동 권한 의존성 → 401/403/404
│  └─ routes/           auth, users, admin, workspaces
└─ seed.py              테이블 생성 + 샘플 데이터
```

## 환경 변수

`.env.example` 참고. 운영 배포(`APP_ENV=production`)에서는 `JWT_SECRET`을 바꾸지 않으면 서버가 시작되지 않는다.

## 배포 (Vercel + Aiven)

프론트엔드와 같은 Vercel 프로젝트에서 FastAPI가 서버리스 함수로 실행된다(루트 `vercel.json`의 `backend` 서비스, 진입점 `app.main:app`). `https://cert-is.vercel.app/api/…`와 `/docs`가 이 서버로 연결된다. DB는 Aiven 무료 MySQL이다.

| Vercel 환경 변수 | 값 |
|---|---|
| `DATABASE_URL` | Aiven 콘솔의 Service URI에서 DB 이름(`/defaultdb`)만 `/certis`로 바꾼 값(`mysql://…/certis?ssl-mode=REQUIRED`). 서버가 PyMySQL 형식으로 바꾸고 TLS로 접속함 |
| `DATABASE_SSL_CA` | Aiven 콘솔의 CA certificate(PEM) 내용. DB 서버 인증서 확인에 사용 |
| `JWT_SECRET` | 32자 이상 무작위 값: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `APP_ENV` | `production` |
| `SEED_PASSWORD` | (선택) 샘플 계정 비밀번호. 지정하지 않으면 `certis1234!` |

- 빌드할 때 `pyproject.toml`의 `[tool.vercel.scripts] build`(`python -m app.seed`)가 테이블과 샘플 계정을 만든다. 이미 있으면 건너뛰므로 배포할 때마다 실행해도 안전하다.
- Vercel은 `pyproject.toml`의 `dependencies`로 패키지를 설치한다. `requirements.txt`를 바꾸면 이 목록도 같이 바꾼다(`tests/test_config.py`가 두 목록이 같은지 확인).
- 미리보기(PR) 배포도 같은 DB를 사용한다.
- Aiven 무료 플랜은 오래 쓰지 않으면 꺼질 수 있다. 이때 API가 500 오류를 내므로 Aiven 콘솔에서 서비스를 다시 켠다.
