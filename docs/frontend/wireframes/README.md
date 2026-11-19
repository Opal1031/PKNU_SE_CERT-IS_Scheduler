# 화면 와이어프레임

설계 단계에서 그린 저충실도(low-fidelity) 화면 설계안이다. 실제 구현 화면은 `frontend/`에 있고,
여기 그림은 **무엇을 어디에 놓을지 합의한 기록**이다. 구현과 다르면 구현이 최신이다.

## 화면 목록

| 파일 | 화면 |
|---|---|
| `screens/01-guest-home.png` | 비로그인 홈 |
| `screens/02-public-activities.png` | 진행 중 활동 소개(비로그인) |
| `screens/03-authentication.png` | 로그인·회원가입 |
| `screens/04-dashboard.png` | 로그인 후 대시보드 |
| `screens/05-personal-calendar.png` | 개인 캘린더 |
| `screens/06-reservations.png` | 동아리방 예약 |
| `screens/07-activity-management.png` | 활동(프로젝트·스터디) 관리 |
| `screens/08-team-calendar-chat.png` | 팀 캘린더 + 채팅 |
| `screens/09-minutes-chat.png` | 회의록 + 채팅 |
| `screens/10-survey-results.png` | AI 설문·추천 결과 |
| `screens/11-event-booking-dialogs.png` | 일정 등록·예약 신청 대화상자 |
| `screens/12-settings-accounts.png` | 설정·계정 관리 |

`cert-is-wireframes-01.png`, `-02.png`는 위 화면을 두 장으로 모아 붙인 것이다(발표 자료용).

## 다시 생성하기

```bash
pip install pillow
python docs/frontend/wireframes/generate.py
```

한글이 들어가므로 한글 글꼴이 필요하다. Windows(맑은 고딕), macOS(AppleGothic),
리눅스(나눔고딕)를 차례로 찾고, 하나도 없으면 기본 글꼴로 대체해 한글이 깨질 수 있다.
