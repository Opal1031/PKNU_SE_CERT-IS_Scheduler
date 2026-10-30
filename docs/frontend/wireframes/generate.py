"""Draw low-fidelity wireframes from the current frontend; run with Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
FONT = Path('C:/Windows/Fonts')
INK, LINE, SOFT, PAPER = '#303030', '#a8a8a8', '#eeeeee', '#ffffff'
W, H = 1000, 640
im = draw = None


def text(x, y, value, size=18, bold=False, color=INK):
    font = ImageFont.truetype(str(FONT / ('malgunbd.ttf' if bold else 'malgun.ttf')), size)
    draw.text((x, y), value.replace('▾', 'v'), font=font, fill=color)


def box(x, y, w, h, label='', fill=PAPER, size=18):
    draw.rectangle((x, y, x+w, y+h), fill=fill, outline=LINE, width=1)
    if label:
        text(x+12, y+9, label, size)


def button(x, y, w, label, active=False):
    box(x, y, w, 34, label, '#dddddd' if active else PAPER, 15)


def lines(x, y, w, count=3):
    for n in range(count):
        draw.line((x, y+n*17, x+w-(n%3)*w//5, y+n*17), fill='#c5c5c5', width=2)


def field(x, y, w, label, h=32):
    text(x, y, label, 15)
    box(x, y+24, w, h, fill='#fafafa')


def shell(number, title, note, guest=False, activity=False):
    global im, draw
    im = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(im)
    text(0, 0, f'{number:02d}  {title}', 26, True)
    text(0, 42, note, 16, color='#666666')
    box(0, 82, 998, 556)
    box(0, 82, 125, 556, fill=SOFT)
    text(12, 98, 'CERT-IS', 19, True)
    nav = ['활동 목록', '로그인'] if guest else ['달력', '예약', 'AI 설문', '활동 선택', '+ 활동 생성']
    for n, label in enumerate(nav):
        text(13, 160+n*45, label, 15)
    if not guest:
        text(13, 580, '설정 / 접기', 15)
    box(125, 82, 873, 44, fill='#f7f7f7')
    text(143, 92, 'CERT-IS / '+('활동 공간' if activity else title.split(' · ')[0]), 16)
    text(882, 92, '로그인' if guest else '내 계정', 15)


def month(x, y, w, h):
    cw, ch = w/7, (h-28)/5
    box(x, y, w, h)
    for n, day in enumerate('월화수목금토일'):
        text(x+n*cw+10, y+5, day, 13)
    for col in range(1, 7):
        draw.line((x+col*cw, y, x+col*cw, y+h), fill=LINE)
    for row in range(6):
        yy = y+28+row*ch
        draw.line((x, yy, x+w, yy), fill=LINE)
    for n in range(30):
        xx, yy = x+n%7*cw, y+28+n//7*ch
        text(xx+7, yy+5, str(n+1), 12)
        if n in (3, 7, 9, 15, 18, 22, 25):
            box(xx+5, yy+26, cw-10, 18, '일정', SOFT, 11)


def tabs(x=420, y=183, document=False):
    button(x, y, 130, '팀 캘린더', not document)
    button(x+138, y, 110, '회의록', document)
    button(x+256, y, 90, '예약')


def chat():
    box(125, 126, 270, 512, fill='#f8f8f8')
    text(142, 145, '채팅방 선택  ▾', 18, True)
    text(142, 180, '검색 / 태그 / 방 설정', 14)
    for n in range(3):
        xx = 142 if n%2 == 0 else 185
        box(xx, 240+n*80, 192, 60, '메시지', PAPER, 15)
        lines(xx+12, 275+n*80, 145, 1)
    text(142, 500, '대화 → 회의록 인용', 14)
    box(142, 540, 236, 48, '메시지 입력', PAPER, 15)
    button(302, 597, 76, '전송')


screens = []


def save(slug):
    path = OUT / 'screens' / f'{len(screens)+1:02d}-{slug}.png'
    path.parent.mkdir(exist_ok=True)
    im.save(path)
    screens.append(im.copy())


shell(1, '비로그인 홈', '서비스 소개와 시작하기 · Auth.tsx', guest=True)
box(158, 158, 807, 235, fill='#f7f7f7')
text(188, 185, '동아리 활동 공간', 16)
text(188, 220, '함께 배우고, 함께 만들어가는 공간', 30, True)
lines(188, 277, 510, 2)
button(188, 331, 235, '로그인하고 시작하기', True)
button(438, 331, 250, '진행 중인 활동 따라가기')
for x, label in [(158, '함께하는 활동'), (433, '내 일정 한눈에'), (708, '동아리방 예약')]:
    box(x, 415, 257, 112, label)
    lines(x+12, 465, 205, 2)
box(158, 551, 807, 58, '로그인 후 내 활동 이어가기', SOFT)
save('guest-home')

shell(2, '공개 활동 목록', '로그인 전 진행 중인 활동 탐색 · Auth.tsx', guest=True)
text(158, 151, '지금 진행 중인 활동', 24, True)
text(158, 191, '활동 카드 선택 → 로그인', 16)
for n in range(4):
    x, y = 158+n%2*414, 242+n//2*184
    box(x, y, 393, 160)
    text(x+15, y+15, '프로젝트 / 스터디 · 분야', 15)
    text(x+15, y+50, '활동명', 21, True)
    lines(x+15, y+91, 295, 2)
    text(x+15, y+130, '로그인하고 살펴보기 →', 14)
save('public-activities')

shell(3, '로그인 · 회원가입', '공통 소개 영역 + 화면별 입력 폼 · Auth.tsx', guest=True)
box(158, 160, 245, 442, fill=SOFT)
text(181, 187, 'CERT-IS', 24, True)
text(181, 246, '서비스 소개', 24, True)
for n, label in enumerate(['함께하는 활동', '내 일정 한눈에', '동아리방 예약']):
    text(181, 315+n*45, label, 17)
text(181, 556, '← 홈으로 돌아가기', 15)
text(428, 163, '로그인 화면', 21, True)
field(428, 215, 235, '아이디')
field(428, 290, 235, '비밀번호')
button(428, 381, 235, '로그인', True)
text(428, 438, '회원가입으로 이동 →', 15)
box(689, 160, 276, 442, fill='#fafafa')
text(708, 178, '회원가입 화면', 21, True)
for n, label in enumerate(['아이디', '이름', '비밀번호', '비밀번호 확인']):
    field(708, 226+n*68, 235, label, 26)
button(708, 516, 235, '가입 신청', True)
text(708, 566, '신청 완료 → 운영진 승인 대기', 14)
save('authentication')

shell(4, '홈 · 활동 대시보드', '활동 탐색·참가 신청 + 내 요약·D-day · Dashboard.tsx')
text(154, 148, '활동', 24, True)
button(560, 144, 85, '+ 생성')
box(154, 199, 321, 36, '활동 검색', '#fafafa', 15)
button(485, 199, 160, '필터 / 정렬')
button(154, 252, 148, '전체 활동', True)
button(313, 252, 148, '참여 중')
box(154, 308, 491, 284)
text(169, 320, '활동명                     팀장       상태', 16, True)
for n in range(3):
    y = 365+n*72
    text(169, y, '활동명 / 유형 / 분야', 16)
    text(169, y+30, '참여 중 / 신청 대기', 13)
    button(525, y+5, 105, '열기 / 신청')
box(670, 148, 298, 185, '내 프로필 / 역할', SOFT)
text(686, 207, '프로젝트 · 스터디 · 마감 수', 16)
button(686, 268, 265, '내 캘린더 / 예약 바로가기')
box(670, 351, 298, 241, 'D-day', PAPER, 22)
button(686, 396, 265, '활동 필터  ▾')
for n in range(2):
    text(686, 455+n*58, 'D-n  활동명 · 일정 / 마감', 15)
    lines(686, 487+n*58, 240, 1)
save('dashboard')

shell(5, '개인 캘린더', '월간·목록 보기 / 선택일 상세 / 즐겨찾기 · Calendar.tsx')
text(154, 148, '개인 캘린더', 24, True)
button(154, 199, 230, '〈   연.월   〉   오늘')
button(548, 199, 136, '월간 / 목록')
button(696, 199, 130, '표시 조건')
button(838, 199, 128, '+ 일정')
month(154, 257, 548, 342)
box(724, 257, 242, 342, '선택한 날짜', SOFT)
for n in range(3):
    y = 316+n*85
    box(739, y, 210, 70, '일정 제목          ☆', size=14)
    text(750, y+38, '시간 / 담당자 / 업무', 12)
save('personal-calendar')

shell(6, '동아리방 예약', '날짜별 시간표 + 예약 목록 · Reservations.tsx')
text(154, 148, '동아리방 예약', 24, True)
button(154, 198, 260, '시작 날짜  ▾     오늘')
button(820, 198, 147, '+ 예약 신청')
text(154, 244, '09:00~24:00 · 30분 단위 · 빈 칸 선택 시 신청', 15)
box(154, 283, 813, 211)
for n in range(9):
    x = 254+n*89
    draw.line((x, 283, x, 494), fill=LINE)
    if n < 8:
        text(x+8, 290, str(9+n*2), 13)
for n in range(5):
    yy = 323+n*42
    draw.line((154, yy, 967, yy), fill=LINE)
    if n < 4:
        text(169, yy+10, '날짜', 14)
for x, y, ww in [(343, 324, 178), (610, 366, 178), (432, 408, 89), (699, 450, 178)]:
    box(x, y, ww, 41, '예약 구간', '#d9d9d9', 13)
text(154, 514, '내 활동 예약 · 취소 기록 포함', 18, True)
box(154, 552, 813, 55, '활동 / 사용 목적    날짜 · 시작~종료    예약자 · 상태', size=16)
save('reservations')

shell(7, '활동 선택 · 생성 · 관리', '활동 선택창과 관리 팝업의 윤곽 · Dialog.tsx')
box(155, 153, 374, 452, fill='#fafafa')
text(176, 174, '프로젝트 및 스터디', 21, True)
button(176, 224, 330, '참여 중 / 전체   ·   검색')
for n in range(3):
    box(176, 280+n*75, 330, 60, '활동명 · 유형 · 상태', size=16)
button(176, 535, 330, '+ 새 활동 생성')
box(556, 153, 410, 452)
text(576, 174, '활동 생성 / 정보 수정', 21, True)
field(576, 220, 369, '이름 / 유형 / 분야')
field(576, 296, 369, '목표', 54)
field(576, 394, 369, '시작일 / 마감일')
text(576, 472, '구성원 / 상태 / 참가 신청 승인', 15)
text(576, 503, '구성원 관리 · 팀장 위임', 15)
button(576, 552, 177, '닫기')
button(768, 552, 177, '적용', True)
save('activity-management')

shell(8, '팀 캘린더 + 활동 채팅', '전체 메뉴 → 채팅 패널 → 활동 본문 · App / Chat / Calendar', activity=True)
chat()
text(420, 143, '활동명    /    역할 · 관리', 21, True)
tabs()
button(420, 240, 225, '〈  연.월  〉  오늘')
button(656, 240, 307, '월간 / 목록   필터   + 일정')
month(420, 293, 350, 306)
box(788, 293, 175, 306, '선택일 일정', SOFT, 16)
for n in range(3):
    box(800, 347+n*76, 151, 61, '제목 / 담당자', size=13)
save('team-calendar-chat')

shell(9, '회의록 + 활동 채팅', '방별 Markdown 편집·미리보기·이력 · DocumentPage.tsx', activity=True)
chat()
text(420, 143, '활동명    /    역할 · 관리', 21, True)
tabs(document=True)
text(420, 238, '채팅방 회의록 · 버전 정보', 18, True)
button(420, 275, 543, '문서 선택 / 변경 이력 / 내보내기 / 저장')
button(420, 323, 543, '나란히 / 편집 / 미리보기   ·   양식 추가')
box(420, 373, 264, 194, 'Markdown 편집', '#fafafa', 16)
box(698, 373, 265, 194, '미리보기', PAPER, 16)
lines(435, 426, 218, 6)
lines(713, 426, 218, 6)
text(420, 591, '초안 상태 / 저장 충돌 시 최신본과 비교', 14)
save('minutes-chat')

shell(10, 'AI 설문 · 추천 결과', '15문항 대화형 응답 → 분야·활동·직무 추천 · Survey.tsx')
text(154, 148, 'AI 설문', 24, True)
box(154, 196, 396, 405)
text(171, 211, 'CERT-IS 길잡이        문항 / 15', 17, True)
box(171, 253, 361, 9, fill=SOFT)
box(171, 284, 305, 78, '질문 내용', SOFT)
box(250, 380, 282, 52, '이전 답변 / 수정', size=16)
text(171, 455, '평소의 나와 얼마나 비슷한가요?', 15)
text(184, 493, '○    ○    ○    ○    ○', 26)
text(171, 536, '○ 잘 모르겠다', 14)
button(171, 565, 172, '이전 질문')
button(359, 565, 173, '다음 질문', True)
text(568, 375, '→', 27, True)
box(614, 196, 353, 405, fill='#fafafa')
text(633, 212, 'AI 설문 결과', 21, True)
box(633, 258, 315, 92, '추천 분야 순위', PAPER, 17)
lines(649, 303, 255, 2)
box(633, 366, 315, 80, '추천 스터디 / 프로젝트', PAPER, 17)
box(633, 462, 315, 64, '추천 직무', PAPER, 17)
button(633, 552, 315, '답변 수정 / 다시 시작')
save('survey-results')

shell(11, '일정 등록 · 예약 신청', '캘린더·시간표에서 여는 팝업 · Dialog.tsx')
for x, ww in [(154, 388), (571, 396)]:
    box(x, 153, ww, 452, fill='#fafafa')
text(174, 173, '일정 등록 / 수정', 22, True)
field(174, 220, 348, '제목 / 활동')
field(174, 291, 348, '시작·종료 날짜 / 시간')
field(174, 362, 348, '공개 범위 / 담당자')
field(174, 433, 348, '담당업무 / 진행 상태')
button(174, 552, 160, '닫기')
button(350, 552, 172, '적용', True)
text(591, 173, '예약 신청 / 변경', 22, True)
field(591, 220, 356, '참여 활동')
field(591, 291, 356, '날짜 / 시작·종료 시간')
field(591, 362, 356, '사용 목적', 59)
text(591, 465, '09:00~24:00 · 30분 단위', 15)
text(591, 495, '예약 상세 → 변경 / 취소 사유 입력', 14)
button(591, 552, 164, '닫기')
button(771, 552, 176, '적용', True)
save('event-booking-dialogs')

shell(12, '설정 · 계정 관리', '내 계정 + 임원진 관리 + 화면·데모 설정 · Settings / Accounts')
text(154, 147, '설정', 24, True)
box(154, 195, 390, 190, '내 계정', PAPER, 20)
text(170, 240, '아이디 / 이름 / 역할', 15)
field(170, 275, 357, '현재·새 비밀번호 / 확인')
button(374, 342, 153, '비밀번호 변경')
box(566, 195, 401, 190, '계정 관리 (임원진)', SOFT, 20)
button(583, 244, 367, '가입 승인 / 계정 발급 / 검색')
text(583, 302, '계정 목록 / 역할 / 로그인 허용', 15)
text(583, 341, '계정 수정 / 비밀번호 초기화', 15)
for n, label in enumerate(['화면 설정 · 초기화', '대화 수신 예시 · 메시지 추가', '샘플 데이터 · 초기화']):
    box(154, 408+n*48, 813, 39, label, '#fafafa', 15)
box(154, 562, 813, 45, '최근 변경 기록', size=16)
save('settings-accounts')


assert len(screens) == 12
assert all(screen.size == (W, H) for screen in screens)
for page in range(2):
    sheet = Image.new('RGB', (3200, 1630), '#f4f4f4')
    sd = ImageDraw.Draw(sheet)
    def heading(x, y, value, size, bold=False, fill=INK):
        sd.text((x, y), value, font=ImageFont.truetype(str(FONT / ('malgunbd.ttf' if bold else 'malgun.ttf')), size), fill=fill)
    heading(60, 36, f'CERT-IS  /  기능별 와이어프레임  {page+1:02d}', 42, True)
    heading(60, 101, '현재 프론트 구조에서 역으로 정리한 낮은 충실도 화면 · 주요 영역과 동작만 표현', 23, fill='#666666')
    for n in range(6):
        x, y = 60+n%3*1040, 177+n//3*700
        sheet.paste(screens[page*6+n], (x, y))
    heading(60, 1550, '소스 기준: frontend/src  ·  2026-10-29  ·  회색 상자는 콘텐츠·입력·버튼 영역이며 실제 데이터는 생략', 21, fill='#666666')
    sheet.save(OUT / f'cert-is-wireframes-{page+1:02d}.png')
print('Saved 2 overview PNGs and 12 individual screens to', OUT)
