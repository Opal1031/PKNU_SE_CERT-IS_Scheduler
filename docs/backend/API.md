# CERT-IS API 명세

WBS 2.2 산출물. 서버를 실행하면 같은 내용을 Swagger 화면(`/docs`)에서 직접 호출해 볼 수 있다.
**구현** 표시는 `feature/backend-auth` 브랜치에 코드와 테스트가 있는 API, **설계**는 담당 WBS 작업에서 구현할 예정인 API다.

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 주소 | 로컬 `http://127.0.0.1:8000`, 모든 API는 `/api`로 시작 |
| 형식 | JSON, 필드 이름은 camelCase(프론트 `model.ts`와 동일) |
| 인증 | `POST /api/auth/login`으로 받은 토큰을 `Authorization: Bearer <accessToken>` 헤더에 붙임. 유효 시간 12시간 |
| 로그아웃 | 서버 상태가 없는 JWT 방식이라 프론트가 저장한 토큰을 지우면 됨 |
| 날짜·시각 | 날짜 `YYYY-MM-DD`, 시각 `HH:MM`(예약 종료는 `24:00` 허용), 생성·수정 시각은 UTC ISO 8601(`2026-10-20T06:00:00Z`) |
| ID | 서버가 발급하는 정수 |
| 오류 | `{"detail": "사람이 읽을 수 있는 이유"}` · 입력 형식 오류(422)는 FastAPI 기본 형식으로 `detail`에 필드별 목록 |

| 상태 코드 | 의미 |
|---|---|
| 200 / 201 / 204 | 성공 / 생성됨 / 본문 없는 성공 |
| 400 | 규칙상 허용되지 않는 요청(예: 자기 자신의 임원 권한 해제) |
| 401 | 로그인 필요, 토큰 만료·위조, 비활성 계정 |
| 403 | 로그인했지만 권한 없음(역할·구성원 여부) |
| 404 | 대상 없음 |
| 409 | 충돌(아이디 중복, 예약 시간 겹침, 회의록 버전 충돌) |
| 422 | 입력 형식 오류 |

## 2. 권한 모델

권한은 **동아리 역할**과 **활동 관계** 두 축으로 판단한다. 규칙은 `backend/app/core/permissions.py` 한 파일에 모여 있고 프론트 `model.ts`의 `canView`·`writable`·`leader`·`bookingEditable`·`eventEditable`과 같은 결과를 낸다.

- 동아리 역할: `officer`(임원진) / `member`(일반부원) — 계정마다 하나
- 활동 관계: 팀장(`leader`) / 팀원(`member`) / 미참여 — 활동마다 다름

| 동작 | 일반부원 · 미참여 | 팀원 | 팀장 | 임원진 · 미참여 |
|---|:-:|:-:|:-:|:-:|
| 진행 중 활동 소개 보기(비로그인 포함) | O | O | O | O |
| 활동 상세·팀 캘린더 조회 | X | O | O | O (조회 전용) |
| 일정·채팅방·회의록 변경 (보관 활동 제외) | X | O | O | X |
| 활동 정보 수정·구성원 변경·팀장 위임 | X | X | O | X |
| 채팅 열람·전송 (초대된 방만) | X | O | O | X |
| 동아리방 예약 신청 | X | O | O | O |
| 예약 변경·취소 | 본인 예약만 | 본인 예약만 | 활동 예약 전체 | 전체 |
| 다른 활동 예약의 사용 목적 보기 | X (활동·시간만) | — | — | O |
| 동아리 전체 일정 등록·수정 | X | X | X | O |
| 계정 발급·역할 변경·비활성화 | X | X | X | O |

## 3. 구현된 API

### 인증

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/auth/login` | 누구나 | 로그인, 토큰 발급 |
| GET | `/api/auth/me` | 로그인 | 내 계정·역할 확인(새로고침 후 세션 복원) |

```http
POST /api/auth/login
{"username": "minseo", "password": "certis1234!"}

200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "bearer",
  "expiresIn": 43200,
  "user": {"id": 4, "username": "minseo", "name": "민서", "role": "member",
           "officer": false, "isActive": true, "createdAt": "2026-10-20T06:00:00Z"}
}
```

- 아이디가 없거나 비밀번호가 틀리면 같은 401 응답(`아이디 또는 비밀번호가 올바르지 않음`)을 준다. 아이디 존재 여부가 드러나지 않게 하기 위함이다.
- 비밀번호는 맞지만 비활성화된 계정이면 403.
- 역할은 토큰에 넣지 않고 요청마다 DB에서 읽는다. 임원진이 역할을 바꾸거나 계정을 막으면 이미 발급된 토큰에도 즉시 반영된다.

### 사용자

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/users` | 로그인 | 활성 사용자 `[{id, name}]` — 구성원·담당자 선택용 |
| PATCH | `/api/users/me/password` | 로그인 | `{currentPassword, newPassword}` → 204, 현재 비밀번호 틀리면 400 |

### 임원진 · 계정 관리

회원가입 없이 임원진이 계정을 발급한다(로그인 화면 안내 문구 "계정 발급은 운영진에게 문의"와 같은 운영 방식).

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/admin/users` | 임원진 | 전체 계정(비활성 포함) |
| POST | `/api/admin/users` | 임원진 | `{username, name, password, role?}` → 201. 아이디 중복 409 |
| PATCH | `/api/admin/users/{id}` | 임원진 | `{name?, role?, isActive?}` 보낸 값만 변경. 자기 자신의 임원 해제·비활성화는 400 |
| PUT | `/api/admin/users/{id}/password` | 임원진 | `{newPassword}` → 204. 비밀번호를 잊은 부원의 비밀번호 초기화 |

- 아이디: 영문·숫자·`_.-` 3~50자, 비밀번호 8~128자.
- 발급·변경·비밀번호 초기화는 `audit_logs`에 기록한다.
- 화면: 설정 → **계정 관리**(임원진에게만 보임). 모든 서버 계정은 설정 → **내 계정**에서 비밀번호를 바꾼다.

### 활동 조회

등록·수정·필터는 WBS 5.1(아래 설계)에서 같은 라우터에 추가한다.

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/public/workspaces` | 누구나 | 진행 중 활동 소개 `{id, type, name, initial, field, status, goal}` |
| GET | `/api/workspaces?scope=mine` | 로그인 | 내가 참여한 활동 |
| GET | `/api/workspaces?scope=all` | 임원진 | 전체 활동(일반부원은 403) |
| GET | `/api/workspaces/{id}` | 구성원·임원진 | 활동 상세 |

```json
{
  "id": 1, "type": "project", "name": "CERT-IS 통합 관리", "initial": "CI",
  "field": "웹 보안", "status": "진행 중", "goal": "동아리 운영을 하나의 공간으로",
  "startDate": null, "endDate": null, "leaderId": 2, "createdBy": 2,
  "memberIds": [2, 3, 4, 5], "updatedAt": "2026-10-20T06:00:00Z",
  "myRole": "leader"
}
```

`myRole`: `leader`(팀장) / `member`(팀원) / `viewer`(참여하지 않은 임원진의 조회 전용). 프론트 `role()` 표시와 대응한다.

### 시스템

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 서버·DB 연결 확인 `{"status": "ok"}` |

## 4. 설계된 API (구현 예정)

요청·응답 필드는 프론트 `model.ts` 타입을 그대로 따른다. 변경 API는 `backend/app/api/deps.py`의 `WritableWorkspace`(구성원), `LeaderWorkspace`(팀장), `Officer`(임원진) 의존성으로 권한을 검사한다.

| WBS · 담당 | 메서드 | 경로 | 권한 | 비고 |
|---|---|---|---|---|
| 5.1 · PM | GET | `/api/workspaces?type=&field=&status=&leaderId=&q=&order=` | 로그인 | 담당자·상태·보안 분야 필터 |
| 5.1 · PM | POST | `/api/workspaces` | 로그인 | 생성자가 최초 팀장, 기본 채팅방 `일반` 함께 생성 |
| 5.1 · PM | PATCH | `/api/workspaces/{id}` | 팀장 | 이름·분야·목표·기간·상태 |
| 5.1 · PM | PUT | `/api/workspaces/{id}/members` | 팀장 | `{memberIds, leaderId}` 팀장 위임 포함 |
| 5.1 · PM | POST | `/api/workspaces/{id}/leave` | 팀원 | 팀장은 먼저 위임해야 함(400) |
| 5.1 · PM | POST | `/api/workspaces/{id}/applications` | 미참여 | 종료된 활동·중복 신청은 400/409 |
| 5.3 · PM | GET | `/api/rooms/{roomId}/document` | 방 구성원 | `{body, version, updatedBy, updatedAt}` |
| 5.3 · PM | PUT | `/api/rooms/{roomId}/document` | 방 구성원 | `{body, baseVersion}` — 최신 버전과 다르면 409 |
| 5.3 · PM | GET | `/api/rooms/{roomId}/document/versions` | 방 구성원 | 최근 10개 |
| 채팅 | GET/POST | `/api/workspaces/{id}/rooms` | 구성원 | 방 목록·생성(참여자·태그 지정) |
| 채팅 | PATCH | `/api/rooms/{roomId}` | 구성원 | 이름·참여자·태그·보관 |
| 채팅 | GET | `/api/rooms/{roomId}/messages?before=&limit=50` | 방 구성원 | 이전 메시지 페이지 |
| 채팅 | WS | `/ws/rooms/{roomId}?token=<accessToken>` | 방 구성원 | 실시간 송수신(FastAPI WebSocket) |
| 태그 | GET/POST/PATCH/DELETE | `/api/workspaces/{id}/tag-groups…` | 구성원 | 그룹·태그 이름·순서 |
| 캘린더 | GET | `/api/calendar?from=&to=&workspaceId=&mine=&scope=` | 로그인 | 일정 + 예약을 합쳐 반환 |
| 캘린더 | POST/PATCH/DELETE | `/api/events[/{id}]` | 구성원 / 동아리 일정은 임원진 | 삭제는 `deleted_at` 기록 |
| 7.1 · BE | GET | `/api/reservations?from=&to=` | 로그인 | 다른 활동 예약은 활동·시간만, 목적 숨김 |
| 7.1 · BE | POST | `/api/reservations` | 구성원·임원진 | `{workspaceId, date, start, end, purpose}` — 겹치면 409 |
| 7.1 · BE | PATCH | `/api/reservations/{id}` | 예약자·팀장·임원진 | 시간 변경 시 슬롯 재점유(겹치면 409) |
| 7.1 · BE | POST | `/api/reservations/{id}/cancel` | 예약자·팀장·임원진 | `{reason}` — 슬롯 해제, 기록은 유지 |
| 6.x · AI | POST | `/api/ai/survey` | 로그인 | `{answers}` → `{scores, recommendation}` (Gemini) |
| 6.x · AI | GET | `/api/ai/survey/latest` | 로그인 | 마지막 결과 복원 |

### 예약 중복 차단 방식(7.1)

1. 요청 검증: 오늘 이후 날짜, 09:00~24:00, 30분 단위, 지난 시각 불가(서버 시각 기준, Asia/Seoul).
2. 한 트랜잭션에서 `reservations` 행과 30분 칸마다 `reservation_slots(date, slot)` 행을 넣는다.
3. 이미 점유된 칸이 있으면 기본키 중복으로 DB가 거부 → 롤백 후 409 `다른 예약과 시간이 겹침`.
4. 두 사람이 같은 시간을 동시에 신청해도 DB 제약 때문에 한 건만 확정된다. (`tests/test_schema.py`에서 확인)
