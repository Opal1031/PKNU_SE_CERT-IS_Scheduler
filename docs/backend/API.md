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
| POST | `/api/auth/signup` | 누구나 | 회원가입 `{username, name, password}` → 201. 일반부원·승인 대기(로그인 차단) 계정으로 생성, 아이디 중복 409 |
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
- 비밀번호는 맞지만 가입 승인 전이거나 비활성화된 계정이면 403.
- 역할은 토큰에 넣지 않고 요청마다 DB에서 읽는다. 임원진이 역할을 바꾸거나 계정을 막으면 이미 발급된 토큰에도 즉시 반영된다.

### 사용자

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/users` | 로그인 | 활성 사용자 `[{id, name}]` — 구성원·담당자 선택용 |
| PATCH | `/api/users/me/password` | 로그인 | `{currentPassword, newPassword}` → 204, 현재 비밀번호 틀리면 400 |

### 임원진 · 계정 관리

회원가입 신청은 승인 대기(`isActive: false`) 상태로 만들어지고, 임원진이 로그인을 허용(`isActive: true`)해야 로그인할 수 있다. 임원진은 승인 없이 바로 쓰는 계정을 직접 발급할 수도 있다.

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/admin/users` | 임원진 | 전체 계정(비활성 포함) |
| POST | `/api/admin/users` | 임원진 | `{username, name, password, role?}` → 201. 아이디 중복 409 |
| PATCH | `/api/admin/users/{id}` | 임원진 | `{username?, name?, role?, isActive?}` 보낸 값만 변경. 가입 승인은 `isActive: true`. 아이디 중복 409, 자기 자신의 임원 해제·비활성화는 400 |
| PUT | `/api/admin/users/{id}/password` | 임원진 | `{newPassword}` → 204. 비밀번호를 잊은 부원의 비밀번호 초기화 |

- 아이디: 영문·숫자·`_.-` 3~50자, 비밀번호 8~128자.
- 회원가입 신청·발급·변경·비밀번호 초기화는 `audit_logs`에 기록한다.
- 로그인 토큰에는 계정 번호만 들어 있어, 아이디를 바꿔도 이미 로그인한 사용자는 로그아웃되지 않는다.
- 승인 대기와 탈퇴·정지로 막은 계정은 모두 `isActive: false`라 화면에서 함께 "승인 대기·비활성"으로 표시한다.
- 화면: 설정 → **계정 관리**(임원진에게만 보임). 모든 서버 계정은 설정 → **내 계정**에서 비밀번호를 바꾼다.

### 활동 (WBS 5.1)

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/public/workspaces` | 누구나 | 진행 중 활동 소개 `{id, type, name, initial, field, status, goal}` |
| GET | `/api/workspaces?scope=mine` | 로그인 | 내가 참여한 활동 |
| GET | `/api/workspaces?scope=all` | 임원진 | 전체 활동(일반부원은 403) |
| GET | `/api/workspaces/{id}` | 구성원·임원진 | 활동 상세 |
| POST | `/api/workspaces` | 로그인 | 활동 등록 → 201. 생성자가 최초 팀장, 기본 채팅방 `일반` 함께 생성 |
| PATCH | `/api/workspaces/{id}` | 팀장 | 보낸 항목만 수정. 시작일 > 종료일이면 400 |
| PUT | `/api/workspaces/{id}/members` | 팀장 | `{memberIds, leaderId}` 구성원 교체·팀장 위임 |
| POST | `/api/workspaces/{id}/leave` | 팀원 | 활동 나가기 → 204. 팀장은 먼저 위임해야 함(400) |
| POST | `/api/workspaces/{id}/applications` | 미참여 | 참가 신청 → 201. 종료·보관 활동 400, 중복 신청 409 |
| POST | `/api/workspaces/{id}/archive` | 팀장·임원진 | 보관 → 조회 전용. 이미 보관됐으면 400 |

**목록 필터** — 모두 선택이며 지정한 것끼리 AND로 묶인다.

```
GET /api/workspaces?scope=mine&type=study&field=암호학&status=보류&leaderId=3&q=해킹&order=name
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `scope` | `mine`(기본) · `all` | `all`은 임원진 전용 |
| `type` | `project` · `study` | |
| `field` | 보안 분야 | 정확히 일치 |
| `status` | `계획` `진행 중` `보류` `완료` `보관` | 정확히 일치 |
| `leaderId` | 사용자 ID | 팀장 기준 |
| `q` | 검색어 | 이름·목표 부분 일치. `%`·`_`는 글자 그대로 찾음 |
| `order` | `id`(기본) · `name` · `updated` | `updated`는 최신순 |

**구성원 변경 시 주의** — 명단에서 빠진 사람은 그 활동의 채팅방에서도 함께 빠진다. 남는 구성원의 가입 시각(`joined_at`)은 보존된다.

**활동 삭제 대신 보관** — `DELETE`는 두지 않는다. 회의록·채팅 메시지·예약·일정이 활동에 `ondelete="CASCADE"`로 묶여 있어, 행을 지우면 그 활동에서 오간 **기록이 전부 함께 사라지기** 때문이다. 잘못 만든 활동을 치우려다 회의 기록을 잃는 쪽이 더 큰 손해다.

보관하면 조회 전용이 되어 일정·회의록·채팅 전송이 모두 막히고, 목록에서는 `status` 필터로 걸러낸다. 되돌리려면 `PATCH`로 상태를 바꾸면 된다.

### 회의록 (WBS 5.3)

회의록은 채팅방과 1:1이라 별도 식별자 없이 `roomId`로 접근한다. 열람 권한은 **그 방에 참여한 활동 구성원**이며, 임원진이라도 방에 없으면 403이다(운영 조회 권한을 대화·회의록 내용까지 넓히지 않는다).

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/rooms/{roomId}/document` | 방 구성원 | 불러오기. 한 번도 저장 안 한 방이면 빈 회의록(version 1)을 만들어 돌려줌 |
| PUT | `/api/rooms/{roomId}/document` | 방 구성원 | 저장. `{body, baseVersion}` — 최신 버전과 다르면 409 |
| GET | `/api/rooms/{roomId}/document/versions` | 방 구성원 | 버전 이력 최근 10개(최신순) |

**동시 편집 처리(낙관적 잠금)** — 불러올 때 받은 `version`을 저장할 때 `baseVersion`으로 돌려보낸다. 그 사이 다른 사람이 저장했으면 **저장하지 않고 409**를 주며, 이때 현재 내용을 함께 돌려주어 화면이 비교·병합할 수 있게 한다.

```http
PUT /api/rooms/1/document
{"body": "## 11/19 회의", "baseVersion": 1}

409 Conflict
{
  "detail": "다른 사람이 먼저 저장함. 최신 내용을 확인하고 다시 저장해야 함",
  "currentVersion": 2,
  "currentBody": "## 앨리스가 먼저 쓴 내용",
  "updatedBy": 3,
  "updatedAt": "2026-11-19T05:40:00Z"
}
```

**버전 이력의 의미** — 이력 한 건은 *그 버전으로 저장되기 직전의 본문*이다. 빈 회의록에서 시작해 두 번 저장하면 이력에는 `v1`(빈 내용), `v2`(첫 저장 내용)가 남고 현재는 `v3`이다. 되돌리기는 이력의 `body`를 현재 `version`을 `baseVersion`으로 삼아 다시 저장하면 된다.

### 동아리방 예약 (WBS 7.1)

시간은 **자정 기준 분**으로 주고받는다(`540`=09:00, `1440`=24:00). 24:00 종료를 `TIME` 타입으로 표현하기 애매해 정수를 쓴다. 운영 시간은 09:00~24:00이고 **30분 단위**로만 예약된다.

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/reservations?from=&to=&includeCancelled=` | 로그인 | 기간 조회. 기본은 확정 건만 |
| POST | `/api/reservations` | 구성원·임원진 | 신청. 겹치면 409 |
| PATCH | `/api/reservations/{id}` | 예약자·팀장·임원진 | 시간·목적 변경. 겹치면 409 |
| POST | `/api/reservations/{id}/cancel` | 예약자·팀장·임원진 | `{reason}` — 시간 해제, 기록은 유지 |

**중복 예약을 막는 방식** — 애플리케이션에서 "겹치는지 조회한 뒤 저장"하지 **않는다**. 두 사람이 동시에 누르면 조회와 저장 사이에 끼어들 수 있기 때문이다. 대신 `reservation_slots`의 `(date, slot)` **복합 기본키**에 30분 슬롯 행을 같은 트랜잭션에서 함께 넣는다. 동시 요청은 기본키 중복으로 실패하므로 **한 건만 확정된다**.

거부될 때는 트랜잭션이 통째로 롤백되어 **슬롯이 일부만 남는 일이 없다**. 일부라도 남으면 그 시간이 영영 막힌다.

**사용 목적 가리기** — 다른 활동의 예약은 `purpose`와 `cancelReason`이 `null`로 내려온다. 언제 누가 쓰는지는 공개하되 무엇을 하는지까지 공개할 이유가 없다. 같은 활동 구성원과 임원진에게만 보인다. `canEdit`로 화면이 수정 버튼 노출을 판단한다.

**취소** — 예약 행은 남기고 상태만 `취소`로 바꾸며 슬롯만 해제한다. 누가 왜 취소했는지가 기록으로 남고, 그 시간은 즉시 다시 예약할 수 있다.

```http
POST /api/reservations
{"workspaceId": 1, "date": "2026-12-01", "startMinute": 600, "endMinute": 720, "purpose": "스터디"}

409 Conflict
{"detail": "이미 예약된 시간이 포함되어 있음"}
```

### 통합 캘린더

일정과 동아리방 예약을 **한 번의 요청으로 함께** 돌려준다. 화면이 두 번 요청해 합치지 않아도 되게 하기 위함이다.

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/calendar?from=&to=&workspaceId=&mine=` | 로그인 | 기간에 걸치는 일정 + 그 기간의 확정 예약 |
| POST | `/api/events` | 구성원 / club은 임원진 | 일정 등록 |
| PATCH | `/api/events/{id}` | 〃 | 수정. 공개 범위·소속 활동은 변경 불가 |
| DELETE | `/api/events/{id}` | 〃 | 소프트 삭제(`deleted_at` 기록) |

**공개 범위(visibility)** — 보이는 사람과 고칠 수 있는 사람이 함께 결정된다.

| 값 | 보이는 사람 | 고칠 수 있는 사람 | `workspaceId` |
|---|---|---|---|
| `club` | 누구나 | 임원진 | 반드시 `null` |
| `workspace` | 그 활동 구성원 + 임원진 | 그 활동 구성원 | 필수 |
| `private` | 담당자 본인만 | 그 활동 구성원 | 필수 |

- `club`에 `workspaceId`를 넣거나, 나머지에서 빼면 **422**다.
- `private` 일정의 담당자를 비우면 **등록자가 담당자가 된다**. 아무에게도 보이지 않는 일정이 생기지 않게 하기 위함이다.
- 임원진은 활동 일정을 **보지만 고치지는 못한다**(`canEdit: false`). 회의록·대화와 달리 일정은 운영 조회 대상이다.

**기간 판정** — 시작일이 `to` 이전이고 종료일이 `from` 이후인 일정을 모두 포함한다. 조회 기간을 **가로지르는** 일정도 걸린다.

**삭제** — 행을 지우지 않고 `deleted_at`만 기록한다. 캘린더에서는 사라지되 무엇이 언제 지워졌는지는 남는다. 이미 삭제된 일정에 대한 수정·삭제는 404다.

**예약 합본** — `확정` 상태만 포함한다(취소 건은 예약 화면에서 본다). 사용 목적은 예약 API와 같은 규칙으로 다른 팀에게 `null`로 가려진다.

### 채팅 · 태그

방은 활동에 속하고, 참여자는 **활동 구성원 중에서 따로 고른다**. 회의록이 방에 1:1로 붙으므로 방을 나누면 회의별 회의록이 생긴다.

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/workspaces/{id}/rooms?includeArchived=` | 구성원 | **내가 참여한** 방만 |
| POST | `/api/workspaces/{id}/rooms` | 구성원 | 생성. 참여자 비우면 구성원 전원 |
| PATCH | `/api/rooms/{roomId}` | 방 구성원 | 이름·참여자·태그·보관 |
| GET | `/api/rooms/{roomId}/messages?before=&after=&limit=` | 방 구성원 | 항상 오래된 것부터 |
| POST | `/api/rooms/{roomId}/messages` | 방 구성원 | 전송 |
| WS | `/ws/rooms/{roomId}?token=` | 방 구성원 | 실시간 송수신 |
| GET/POST | `/api/workspaces/{id}/tag-groups` | 구성원 | 태그 그룹 |
| POST | `/api/tag-groups/{groupId}/tags` | 구성원 | 태그 추가 |
| DELETE | `/api/tags/{tagId}` | 구성원 | 태그 삭제 |

**열람 범위** — 활동 구성원이라도 **초대되지 않은 방은 목록에도 안 나온다**. 임원진의 운영 조회 권한도 대화 내용까지는 넓히지 않아, 방 밖의 임원진은 403이다.

**`before` / `after`** — `before`는 과거로 거슬러 올라갈 때, `after`는 새 메시지를 가져올 때 쓴다. **`after`만으로 폴링해도 대화를 따라갈 수 있다.**

**실시간 수신은 폴링이 기본이다** — Vercel 서버리스는 WebSocket 업그레이드를 지원하지 않아 **배포 환경에서는 `/ws/rooms/...` 연결이 즉시 끊긴다**(2026-11-19 운영 서버에서 확인). 따라서 프론트엔드는 폴링으로 구현한다.

| 환경 | 실시간 수신 |
|---|---|
| Vercel 배포 | `GET /messages?after={마지막ID}` 폴링 |
| 로컬 · Docker | WebSocket 또는 폴링 |

두 경로 모두 같은 `MessageOut` 형식을 돌려주므로 화면 코드는 **수신 경로만 바꾸면 된다**. 새 메시지가 없으면 빈 목록이 오므로 짧은 주기로 반복 호출해도 안전하다. 전송은 어느 환경에서나 `POST /messages`를 쓴다.

WebSocket 엔드포인트는 로컬 개발·Docker 배포용으로 남겨 둔다. 브라우저 WebSocket은 헤더를 붙일 수 없어 토큰을 쿼리로 받으며, 연결 목록은 한 프로세스 안에서만 공유된다.

**보관된 방** — 목록에서 숨고 전송이 막히지만, 보관을 되돌릴 수 있어야 하므로 `PATCH`는 열려 있다.

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
| 6.x · AI | POST | `/api/ai/survey` | 로그인 | `{answers}` → `{scores, recommendation}` (OpenAI) |
| 6.x · AI | GET | `/api/ai/survey/latest` | 로그인 | 마지막 결과 복원 |

### 예약 중복 차단 방식(7.1)

1. 요청 검증: 오늘 이후 날짜, 09:00~24:00, 30분 단위, 지난 시각 불가(서버 시각 기준, Asia/Seoul).
2. 한 트랜잭션에서 `reservations` 행과 30분 칸마다 `reservation_slots(date, slot)` 행을 넣는다.
3. 이미 점유된 칸이 있으면 기본키 중복으로 DB가 거부 → 롤백 후 409 `다른 예약과 시간이 겹침`.
4. 두 사람이 같은 시간을 동시에 신청해도 DB 제약 때문에 한 건만 확정된다. (`tests/test_schema.py`에서 확인)
