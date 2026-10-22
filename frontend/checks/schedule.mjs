// 달력·예약 화면 브라우저 점검. 샘플 일정·예약을 넣은 checks/schedule.html을 연 탭에서
// checkSchedule, checkCalendarBookings, checkCalendarPins를 실행한다.
import assert from 'node:assert/strict';

/** 월간 달력 격자·날짜 상세와 예약 시간표(머리글·월 구분·예약 칸·추가 로드·날짜 이동)를 점검한다. */
// Open /checks/schedule.html in cua_repl, then await checkSchedule(tab).
export async function checkSchedule(tab) {
  const page = tab.playwright;
  // 달력: 격자 칸 수, 칸당 미리보기 2개, +n을 누르면 그날 일정 전체 표시
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.domSnapshot();
  const month = await page.locator('.month-calendar').evaluate(el => ({
    height: el.clientHeight,
    bottom: el.getBoundingClientRect().bottom,
    viewport: window.innerHeight,
    weeks: Number(getComputedStyle(el).getPropertyValue('--weeks'))
  }));
  assert.equal(await page.locator('.calendar-day').count(), month.weeks * 7);
  const dense = page.locator('.calendar-day.selected');
  assert.equal(await dense.locator('.calendar-event').count(), 2);
  await dense.locator('.calendar-count').click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-aside .event-row').count(), 6, 'Day details retain every event');
  // 다음 달로 넘기면 1일이 선택됨
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-day.selected .day-button').innerText({}), '1');
  // 예약 시간표: 09~24시 머리글, 28일 행, 월 구분선, 날짜 표기
  await page.getByRole('button', { name: '예약 확인', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.reservation-time-row .time-label').count(), 15);
  const hours = await page
    .locator('.reservation-time-row')
    .evaluate(el => [...el.querySelectorAll('.time-label')].map(label => label.firstChild.textContent));
  assert.equal(
    JSON.stringify(hours),
    JSON.stringify(Array.from({ length: 15 }, (_, i) => String(9 + i).padStart(2, '0')))
  );
  assert.equal(await page.locator('.time-end').innerText({}), '24');
  assert.equal(await page.locator('.reservation-day-row').count(), 28);
  const dates = await page
    .locator('.reservation-board')
    .evaluate(el => [...el.querySelectorAll('.reservation-day-row')].map(row => row.dataset.date));
  const months = [...new Set(dates.map(date => `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`))];
  assert.equal(
    JSON.stringify(
      await page
        .locator('.reservation-board')
        .evaluate(el => [...el.querySelectorAll('.reservation-month-divider')].map(divider => divider.textContent))
    ),
    JSON.stringify(months)
  );
  assert.match(await page.locator('.reservation-date strong').first().innerText({}), /^\d{1,2}\([월화수목금토일]\)$/);
  // 예약 칸: 하루 30칸·24:00 마감, 여러 칸에 걸친 예약, 소유자 표시, 취소 구간, 빈 칸 신청
  const empty = page.locator('.reservation-day-row').nth(2);
  assert.equal(await empty.locator('.booking-slot').count(), 30);
  assert.match(await empty.locator('[data-start="23:30"]').getAttribute('title'), /23:30~24:00/);
  assert.equal(await page.locator('[data-start="24:00"], [data-start="00:00"], [data-start="01:00"]').count(), 0);
  const row = page.locator('.reservation-day-row').nth(1),
    date = await row.getAttribute('data-date');
  const mine = row.locator('[data-start="10:00"]');
  assert.equal(
    await mine.evaluate(el => getComputedStyle(el).gridColumnStart),
    'span 3',
    '90-minute booking spans three half-hours'
  );
  assert.equal(await row.locator('[data-start="10:30"]').count(), 0, 'Booking continuation is not a second button');
  await mine.click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), {
    kind: 'booking-info',
    id: 'mine'
  });
  assert.equal(await row.locator('[data-start="14:00"]').innerText({}), '지수', 'Bookings display their owner');
  assert.match(await row.locator('[data-start="14:00"]').getAttribute('title'), /14:00~15:00 · 지수$/);
  assert.equal(
    await row.locator('[data-start="22:30"]').evaluate(el => getComputedStyle(el).gridColumnStart),
    'span 3',
    'Booking ending at midnight occupies its full interval'
  );
  assert.equal(await row.locator('[data-start="22:30"]').innerText({}), '민서');
  assert.equal(await row.locator('[data-start="12:00"]').getAttribute('disabled'), null, 'Cancelled interval is free');
  await row.locator('[data-start="11:30"]').click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), {
    kind: 'booking',
    date,
    start: '11:30'
  });
  // 스크롤하면 날짜가 더 붙고, 시간 머리글과 현재 월 구분선은 위에 고정됨
  await page.locator('.reservation-board-wrap').press('End');
  // 키보드 스크롤 뒤 React가 추가 날짜 행을 반영한 후 확인한다.
  await page.locator('.reservation-day-row').nth(28).waitFor({ state: 'attached' });
  await page.domSnapshot();
  assert.ok((await page.locator('.reservation-day-row').count()) > 28, 'Scrolling loads later dates');
  const sticky = await page.evaluate(() => {
    const head = document.querySelector('.reservation-time-row').getBoundingClientRect(),
      board = document.querySelector('.reservation-board-wrap').getBoundingClientRect();
    return Math.abs(head.top - board.top) < 2;
  });
  assert.ok(sticky, 'Times stay visible while dates scroll');
  const rowsBeforeScroll = await page.locator('.reservation-day-row').count();
  await page.locator('.reservation-board-wrap').press('End');
  await page.locator('.reservation-day-row').nth(rowsBeforeScroll).waitFor({ state: 'attached' });
  await page.domSnapshot();
  const pinnedMonth = await page.evaluate(() => {
    const head = document.querySelector('.reservation-time-row').getBoundingClientRect();
    const months = [...document.querySelectorAll('.reservation-month-divider')];
    const current = months.filter(month => Math.abs(month.getBoundingClientRect().top - head.bottom) < 2).at(-1);
    const date = [...document.querySelectorAll('.reservation-day-row')].find(
      row => row.getBoundingClientRect().bottom > current.getBoundingClientRect().bottom
    ).dataset.date;
    return {
      count: months.filter(month => Math.abs(month.getBoundingClientRect().top - head.bottom) < 2).length,
      text: current.textContent,
      expected: `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`
    };
  });
  assert.ok(pinnedMonth.count > 1);
  assert.equal(
    pinnedMonth.text,
    pinnedMonth.expected,
    'The new month replaces the pinned heading below the time header'
  );
  // 시작 날짜를 바꾸면 그날부터 다시 그리고 맨 위로 스크롤, 지난 칸은 비활성
  await page.getByLabel('예약 시작 날짜').fill('2000-01-01');
  // Native date inputs commit a real change through keyboard/picker input.
  await page.getByLabel('예약 시작 날짜').press('ArrowUp');
  await page.domSnapshot();
  const past = await page.getByLabel('예약 시작 날짜').evaluate(el => el.value);
  assert.ok(past < '2020-01-01');
  assert.equal(await page.locator('.reservation-day-row').first().getAttribute('data-date'), past);
  assert.equal(
    await page.locator('.reservation-day-row').first().locator('[data-start="09:00"]').getAttribute('disabled'),
    ''
  );
  assert.equal(
    await page.locator('.reservation-board-wrap').evaluate(el => el.scrollTop),
    0,
    'Date jump resets scroll'
  );
  // '오늘'로 돌아오기
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.reservation-day-row.today').count(), 1);
}

/** 예약이 달력(월간 칸·날짜 상세·목록)에 일정처럼 보이고 누르면 예약 정보를 여는지 점검한다. */
export async function checkCalendarBookings(tab) {
  const page = tab.playwright;
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.getByRole('button', { name: '달력 확인', exact: true }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.domSnapshot();
  // 월간 칸의 예약
  await page.locator('.calendar-event[data-event-id="booking:mine"]').click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), {
    kind: 'booking-info',
    id: 'mine'
  });
  // 날짜 상세의 예약. 다른 활동·취소된 예약은 보이지 않음
  const bookingDay = page.locator('.calendar-day').filter({ has: page.locator('[data-event-id="booking:mine"]') });
  const bookingDate = await bookingDay.getAttribute('data-date');
  await bookingDay.locator('.day-button').click();
  await page.domSnapshot();
  const row = page.locator('.calendar-aside [data-event-id="booking:mine"] .event-row');
  await row.click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), {
    kind: 'booking-info',
    id: 'mine'
  });
  assert.match(
    await page.locator('.calendar-aside [data-event-id="booking:late"] .event-row').innerText({}),
    /22:30~24:00/
  );
  assert.equal(
    await page.locator('[data-event-id="booking:external"], [data-event-id="booking:cancelled"]').count(),
    0
  );
  // 내 담당 필터·팀 달력에서도 내 예약은 남고 남의 예약은 빠짐
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-aside [data-event-id="booking:late"]').count(), 0);
  assert.equal(await row.count(), 1);
  await page.getByRole('button', { name: '팀 달력 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await row.count(), 1);
  // 목록 보기의 예약(예약이 다음 달이면 달을 넘겨서 확인)
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.getByRole('button', { name: '목록 보기', exact: true }).click();
  await page.domSnapshot();
  if ((await page.locator('.month-heading h2').innerText({})) !== bookingDate.slice(0, 7).replace('-', '.')) {
    await page.getByRole('button', { name: '다음 달', exact: true }).click();
    await page.domSnapshot();
  }
  await page.locator('.event-list [data-event-id="booking:mine"] .event-row').click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), {
    kind: 'booking-info',
    id: 'mine'
  });
}

/** 개인 캘린더 즐겨찾기: 여러 개 고정, 새로고침 유지, 사용자별 분리, 팀 달력 미적용, 목록·월간 공유 */
export async function checkCalendarPins(tab) {
  const page = tab.playwright;
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.getByRole('button', { name: '달력 확인', exact: true }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.domSnapshot();
  // 오늘 일정 4개를 즐겨찾기하면 모두 칸에 보이고 칸 높이가 늘어남
  const date = await page.locator('.calendar-day.selected').getAttribute('data-date');
  const cell = page.locator(`.calendar-day[data-date="${date}"]`),
    initialHeight = await cell.evaluate(el => el.clientHeight);
  for (const i of [2, 3, 4, 5]) {
    await page.locator(`.calendar-aside [data-event-id="dense-${i}"] .event-pin`).click();
    await page.domSnapshot();
  }
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 4, 'Every personal pin is visible');
  assert.ok((await cell.evaluate(el => el.clientHeight)) > initialHeight, 'Pinned contents expand their week');
  const titleFits = await cell
    .locator('[data-event-id="dense-4"]')
    .evaluate(el => el.scrollHeight === el.clientHeight && el.scrollWidth === el.clientWidth);
  assert.ok(titleFits, 'Pinned titles wrap without clipping');
  assert.ok(
    (await page.locator('.calendar-event.pinned[data-event-id="dense-5"]').count()) >= 2,
    'Multi-day favorite appears on every covered day'
  );
  // 새로고침·사용자 전환 후에도 사용자별로 유지
  await tab.reload();
  await page.domSnapshot();
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 4, 'Reload preserves multiple pins');
  await page.getByRole('button', { name: '사용자 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-event.pinned').count(), 0, 'Another user has independent favorites');
  await page.getByRole('button', { name: '사용자 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 4);
  // 내 담당 필터에서도 즐겨찾기는 보이고, 팀 달력에는 적용되지 않음
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(
    await cell.locator('.calendar-event.pinned[data-event-id="dense-4"]').count(),
    1,
    'Visible favorites remain even outside my assignments'
  );
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.getByRole('button', { name: '팀 달력 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.event-pin').count(), 0);
  assert.equal(await page.locator('.calendar-event.pinned').count(), 0, 'Personal pins do not affect team calendar');
  // 즐겨찾기를 모두 풀면 원래 높이로 돌아오고, 목록 보기에서 건 핀은 월간 보기에도 반영
  await page.getByRole('button', { name: '팀 달력 전환', exact: true }).click();
  await page.domSnapshot();
  for (const i of [2, 3, 4, 5]) {
    await page.locator(`.calendar-aside [data-event-id="dense-${i}"] .event-pin`).click();
    await page.domSnapshot();
  }
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 0);
  assert.equal(await cell.evaluate(el => el.clientHeight), initialHeight, 'Removing pins returns to the normal height');
  await page.getByRole('button', { name: '목록 보기', exact: true }).click();
  await page.domSnapshot();
  await page.locator('.event-list [data-event-id="dense-2"] .event-pin').click();
  await page.getByRole('button', { name: '월간 보기', exact: true }).click();
  await page.domSnapshot();
  assert.equal(
    await cell.locator('.calendar-event.pinned').count(),
    1,
    'List and month views share the same favorites'
  );
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.domSnapshot();
}
