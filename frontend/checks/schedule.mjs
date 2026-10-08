import assert from 'node:assert/strict';

// Open /checks/schedule.html in cua_repl, then await checkSchedule(tab).
export async function checkSchedule(tab) {
  const page = tab.playwright;
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.domSnapshot();
  const month = await page.locator('.month-calendar').evaluate(el => ({ height: el.clientHeight, bottom: el.getBoundingClientRect().bottom, viewport: window.innerHeight, weeks: Number(getComputedStyle(el).getPropertyValue('--weeks')) }));
  assert.equal(await page.locator('.calendar-day').count(), month.weeks * 7);
  const dense = page.locator('.calendar-day.selected');
  assert.equal(await dense.locator('.calendar-event').count(), 2);
  await dense.locator('.calendar-count').click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-aside .event-row').count(), 6, 'Day details retain every event');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-day.selected .day-button').innerText({}), '1');
  await page.getByRole('button', { name: '예약 확인', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.reservation-time-row .time-label').count(), 15);
  const hours = await page.locator('.reservation-time-row').evaluate(el => [...el.querySelectorAll('.time-label')].map(label => label.firstChild.textContent));
  assert.equal(JSON.stringify(hours), JSON.stringify(Array.from({ length: 15 }, (_, i) => String(9 + i).padStart(2, '0'))));
  assert.equal(await page.locator('.time-end').innerText({}), '24');
  assert.equal(await page.locator('.reservation-day-row').count(), 28);
  const dates = await page.locator('.reservation-board').evaluate(el => [...el.querySelectorAll('.reservation-day-row')].map(row => row.dataset.date));
  const months = [...new Set(dates.map(date => `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`))];
  assert.equal(JSON.stringify(await page.locator('.reservation-board').evaluate(el => [...el.querySelectorAll('.reservation-month-divider')].map(divider => divider.textContent))), JSON.stringify(months));
  assert.match(await page.locator('.reservation-date strong').first().innerText({}), /^\d{1,2}\([월화수목금토일]\)$/);
  const empty = page.locator('.reservation-day-row').nth(2);
  assert.equal(await empty.locator('.booking-slot').count(), 30);
  assert.match(await empty.locator('[data-start="23:30"]').getAttribute('title'), /23:30~24:00/);
  assert.equal(await page.locator('[data-start="24:00"], [data-start="00:00"], [data-start="01:00"]').count(), 0);
  const row = page.locator('.reservation-day-row').nth(1), date = await row.getAttribute('data-date');
  const mine = row.locator('[data-start="10:00"]');
  assert.equal(await mine.evaluate(el => getComputedStyle(el).gridColumnStart), 'span 3', '90-minute booking spans three half-hours');
  assert.equal(await row.locator('[data-start="10:30"]').count(), 0, 'Booking continuation is not a second button');
  await mine.click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), { kind: 'booking-info', id: 'mine' });
  assert.equal(await row.locator('[data-start="14:00"]').innerText({}), '지수', 'Bookings display their owner');
  assert.match(await row.locator('[data-start="14:00"]').getAttribute('title'), /14:00~15:00 · 지수$/);
  assert.equal(await row.locator('[data-start="22:30"]').evaluate(el => getComputedStyle(el).gridColumnStart), 'span 3', 'Booking ending at midnight occupies its full interval');
  assert.equal(await row.locator('[data-start="22:30"]').innerText({}), '민서');
  assert.equal(await row.locator('[data-start="12:00"]').getAttribute('disabled'), null, 'Cancelled interval is free');
  await row.locator('[data-start="11:30"]').click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), { kind: 'booking', date, start: '11:30' });
  await page.locator('.reservation-board-wrap').press('End');
  await page.domSnapshot();
  assert.ok(await page.locator('.reservation-day-row').count() > 28, 'Scrolling loads later dates');
  const sticky = await page.evaluate(() => { const head = document.querySelector('.reservation-time-row').getBoundingClientRect(), board = document.querySelector('.reservation-board-wrap').getBoundingClientRect(); return Math.abs(head.top - board.top) < 2; });
  assert.ok(sticky, 'Times stay visible while dates scroll');
  await page.locator('.reservation-board-wrap').press('End');
  await page.domSnapshot();
  const pinnedMonth = await page.evaluate(() => {
    const head = document.querySelector('.reservation-time-row').getBoundingClientRect();
    const months = [...document.querySelectorAll('.reservation-month-divider')];
    const current = months.filter(month => Math.abs(month.getBoundingClientRect().top - head.bottom) < 2).at(-1);
    const date = [...document.querySelectorAll('.reservation-day-row')].find(row => row.getBoundingClientRect().bottom > current.getBoundingClientRect().bottom).dataset.date;
    return { count: months.filter(month => Math.abs(month.getBoundingClientRect().top - head.bottom) < 2).length, text: current.textContent, expected: `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월` };
  });
  assert.ok(pinnedMonth.count > 1);
  assert.equal(pinnedMonth.text, pinnedMonth.expected, 'The new month replaces the pinned heading below the time header');
  await page.getByLabel('예약 시작 날짜').fill('2000-01-01');
  // Native date inputs commit a real change through keyboard/picker input.
  await page.getByLabel('예약 시작 날짜').press('ArrowUp');
  await page.domSnapshot();
  const past = await page.getByLabel('예약 시작 날짜').evaluate(el => el.value);
  assert.ok(past < '2020-01-01');
  assert.equal(await page.locator('.reservation-day-row').first().getAttribute('data-date'), past);
  assert.equal(await page.locator('.reservation-day-row').first().locator('[data-start="09:00"]').getAttribute('disabled'), '');
  assert.equal(await page.locator('.reservation-board-wrap').evaluate(el => el.scrollTop), 0, 'Date jump resets scroll');
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.reservation-day-row.today').count(), 1);
}

export async function checkCalendarBookings(tab) {
  const page = tab.playwright;
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.getByRole('button', { name: '달력 확인', exact: true }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.domSnapshot();
  await page.locator('.calendar-event[data-event-id="booking:mine"]').click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), { kind: 'booking-info', id: 'mine' });
  const bookingDay = page.locator('.calendar-day').filter({ has: page.locator('[data-event-id="booking:mine"]') });
  const bookingDate = await bookingDay.getAttribute('data-date');
  await bookingDay.locator('.day-button').click();
  await page.domSnapshot();
  const row = page.locator('.calendar-aside [data-event-id="booking:mine"] .event-row');
  await row.click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), { kind: 'booking-info', id: 'mine' });
  assert.match(await page.locator('.calendar-aside [data-event-id="booking:late"] .event-row').innerText({}), /22:30~24:00/);
  assert.equal(await page.locator('[data-event-id="booking:external"], [data-event-id="booking:cancelled"]').count(), 0);
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-aside [data-event-id="booking:late"]').count(), 0);
  assert.equal(await row.count(), 1);
  await page.getByRole('button', { name: '팀 달력 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await row.count(), 1);
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.getByRole('button', { name: '목록 보기', exact: true }).click();
  await page.domSnapshot();
  if (await page.locator('.month-heading h2').innerText({}) !== bookingDate.slice(0, 7).replace('-', '.')) {
    await page.getByRole('button', { name: '다음 달', exact: true }).click();
    await page.domSnapshot();
  }
  await page.locator('.event-list [data-event-id="booking:mine"] .event-row').click();
  await page.domSnapshot();
  assert.deepEqual(JSON.parse(await page.getByLabel('선택한 동작').innerText({})), { kind: 'booking-info', id: 'mine' });
}

export async function checkCalendarPins(tab) {
  const page = tab.playwright;
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.getByRole('button', { name: '달력 확인', exact: true }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.domSnapshot();
  const date = await page.locator('.calendar-day.selected').getAttribute('data-date');
  const cell = page.locator(`.calendar-day[data-date="${date}"]`), initialHeight = await cell.evaluate(el => el.clientHeight);
  for (const i of [2, 3, 4, 5]) {
    await page.locator(`.calendar-aside [data-event-id="dense-${i}"] .event-pin`).click();
    await page.domSnapshot();
  }
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 4, 'Every personal pin is visible');
  assert.ok(await cell.evaluate(el => el.clientHeight) > initialHeight, 'Pinned contents expand their week');
  const titleFits = await cell.locator('[data-event-id="dense-4"]').evaluate(el => el.scrollHeight === el.clientHeight && el.scrollWidth === el.clientWidth);
  assert.ok(titleFits, 'Pinned titles wrap without clipping');
  assert.ok(await page.locator('.calendar-event.pinned[data-event-id="dense-5"]').count() >= 2, 'Multi-day favorite appears on every covered day');
  await tab.reload();
  await page.domSnapshot();
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 4, 'Reload preserves multiple pins');
  await page.getByRole('button', { name: '사용자 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.calendar-event.pinned').count(), 0, 'Another user has independent favorites');
  await page.getByRole('button', { name: '사용자 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 4);
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await cell.locator('.calendar-event.pinned[data-event-id="dense-4"]').count(), 1, 'Visible favorites remain even outside my assignments');
  await page.getByRole('button', { name: '내 담당 필터 전환', exact: true }).click();
  await page.getByRole('button', { name: '팀 달력 전환', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('.event-pin').count(), 0);
  assert.equal(await page.locator('.calendar-event.pinned').count(), 0, 'Personal pins do not affect team calendar');
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
  assert.equal(await cell.locator('.calendar-event.pinned').count(), 1, 'List and month views share the same favorites');
  await page.getByRole('button', { name: '즐겨찾기 검사 초기화', exact: true }).click();
  await page.domSnapshot();
}
