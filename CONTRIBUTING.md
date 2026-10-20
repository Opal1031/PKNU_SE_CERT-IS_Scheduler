# 협업 규칙 (브랜치 · PR)

## 폴더

| 폴더 | 담당 | 내용 |
|---|---|---|
| `frontend/` | FE | React + TypeScript |
| `backend/` | BE (+ PM: 활동·회의록 API, AI: 설문 API) | FastAPI |
| `docs/` | 전체 | 설계 문서(`frontend/`, `backend/`, `recommend/`) |
| `.github/workflows/` | BE | CI |

## 브랜치

- `main`: 항상 실행 가능한 상태. 직접 푸시하지 않고 PR로만 합친다.
- 작업 브랜치: `feature/<영역>-<내용>` — 예) `feature/frontend-draft`, `feature/backend-auth`, `feature/backend-reservation`
- 버그 수정: `fix/<내용>`, 문서만 수정: `docs/<내용>`
- 한 브랜치에는 한 가지 기능만 담고, 머지 후 브랜치는 삭제한다.

## PR

1. 작업 전 `git pull origin main`으로 최신 상태에서 브랜치를 만든다.
2. PR 본문에 무엇을 했는지, 어떻게 확인했는지(테스트·화면 캡처), 남은 일을 적는다.
3. CI(GitHub Actions)가 통과하고 팀원 1명 이상 승인하면 머지한다.
4. 다른 영역 파일을 고쳐야 하면 PR 본문에 적고 해당 담당자에게 리뷰를 요청한다.

## 커밋 메시지

`<종류>: <요약>` 형식. 종류는 `feat`(기능), `fix`(버그), `docs`(문서), `test`(테스트), `refactor`, `chore`(설정·빌드).

예) `feat: 로그인 API와 JWT 인증 추가`, `docs: ERD 문서 추가`

## 권장 GitHub 설정 (저장소 관리자)

Settings → Branches → `main` 보호 규칙: Require a pull request before merging(승인 1명), Require status checks to pass(CI).
