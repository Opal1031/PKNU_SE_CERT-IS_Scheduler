import assert from 'node:assert/strict';

// Use a disposable demo user's empty survey, then await checkSurvey(tab).
export async function checkSurvey(tab) {
  const page = tab.playwright;
  await page.getByRole('link', { name: 'AI 설문', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('#chat-sidebar').count(), 0);
  assert.equal(await page.getByRole('button', { name: '다음 질문', exact: true }).isEnabled(), false);
  const circles = await page.locator('.survey-circle').evaluateAll(elements => elements.map(e => e.getBoundingClientRect().width));
  assert.ok(circles[0] > circles[1] && circles[1] > circles[2] && circles[2] < circles[3] && circles[3] < circles[4]);
  const bounds = () => page.evaluate(() => {
    const main = document.querySelector('#main'), chat = document.querySelector('.survey-chat'), messages = document.querySelector('.survey-messages'), composer = document.querySelector('.survey-composer');
    const rect = e => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }; };
    return { main: rect(main), chat: rect(chat), composer: rect(composer), mainScroll: main.scrollTop, mainOverflow: main.scrollHeight - main.clientHeight, chatScroll: messages.scrollTop, chatOverflow: messages.scrollHeight - messages.clientHeight };
  });
  const initial = await bounds();
  assert.ok(initial.composer.left >= initial.chat.right, 'Answers stay to the right of the chat');
  assert.ok(initial.composer.bottom <= initial.main.bottom && initial.chat.bottom <= initial.main.bottom);
  assert.equal(initial.mainOverflow, 0, 'The outer page fits the viewport');
  await page.getByRole('radio', { name: '매우 그렇다', exact: true }).click();
  await page.getByRole('button', { name: '다음 질문', exact: true }).click();
  await page.domSnapshot();
  await page.getByRole('button', { name: '이전 질문', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.getByRole('radio', { name: '매우 그렇다', exact: true }).evaluate(e => e.checked), true);
  await page.getByRole('button', { name: '다음 질문', exact: true }).click();
  await page.domSnapshot();
  for (let i = 1; i < 15; i++) {
    await page.getByRole('radio', { name: i === 7 ? '잘 모르겠다' : '전혀 그렇지 않다', exact: true }).click();
    await page.getByRole('button', { name: i === 14 ? '추천 결과 보기' : '다음 질문', exact: true }).click();
    await page.domSnapshot();
    if (i === 12) {
      const current = await bounds();
      assert.deepEqual(current.composer, initial.composer, 'New messages do not move the answer panel');
      assert.deepEqual(current.chat, initial.chat, 'Chat height stays fixed');
      assert.equal(current.mainScroll, 0, 'Only the message area scrolls');
      assert.ok(current.chatOverflow > 0 && current.chatScroll > 0);
      await page.getByRole('region', { name: '질문 대화 내역', exact: true }).press('Home');
      await page.domSnapshot();
      const scrolled = await bounds();
      assert.ok(scrolled.chatScroll < current.chatScroll, 'The chat can scroll back to earlier messages');
      assert.equal(scrolled.mainScroll, 0);
      assert.deepEqual(scrolled.composer, initial.composer, 'Scrolling the chat leaves answers fixed');
    }
  }
  assert.equal(await page.locator('.survey-ranking li').count(), 5);
  assert.ok((await page.locator('.survey-ranking li').first().innerText({})).includes('웹 보안'));
  assert.equal(await page.locator('.survey-ranking li').first().getByText('8', { exact: false }).count(), 1);
  assert.ok((await page.locator('.survey-results').innerText({})).includes('14개 응답 반영'));
  assert.equal(await page.getByText('웹 보안 직무', { exact: true }).isVisible(), true);
  const resultLayout = await page.evaluate(() => {
    const box = selector => { const e = document.querySelector(selector), r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: e.scrollHeight - e.clientHeight }; };
    return { main: box('#main'), results: box('.survey-results'), fields: box('.survey-field-panel'), activities: box('[aria-labelledby="survey-activities-title"]'), jobs: box('[aria-labelledby="survey-jobs-title"]'), ranking: box('.survey-ranking'), activityList: box('.survey-activities'), jobList: box('.survey-job-list'), width: innerWidth };
  });
  assert.ok(resultLayout.fields.right <= resultLayout.activities.left);
  assert.ok(resultLayout.activities.bottom <= resultLayout.jobs.top);
  assert.equal(resultLayout.main.overflow, 0);
  assert.equal(resultLayout.results.overflow, 0, 'The result page does not scroll');
  assert.ok(resultLayout.fields.bottom <= resultLayout.results.bottom && resultLayout.jobs.bottom <= resultLayout.results.bottom);
  if (resultLayout.width >= 460) {
    assert.equal(resultLayout.ranking.overflow, 0, 'All five fields fit');
    assert.equal(resultLayout.activityList.overflow, 0, 'Existing matching activities fit');
    assert.equal(resultLayout.jobList.overflow, 0);
  }
  await tab.reload(); await page.domSnapshot();
  assert.equal(await page.locator('.survey-ranking li').count(), 5);
  await page.getByRole('button', { name: '다시 시작', exact: true }).click();
  await page.domSnapshot();
  for (let i = 0; i < 15; i++) {
    await page.getByRole('radio', { name: '잘 모르겠다', exact: true }).click();
    await page.getByRole('button', { name: i === 14 ? '추천 결과 보기' : '다음 질문', exact: true }).click();
    await page.domSnapshot();
  }
  assert.equal(await page.locator('.survey-ranking li').count(), 0);
  assert.ok((await page.locator('.survey-results').innerText({})).includes('계산할 응답이 없어요'));
  await page.getByRole('button', { name: '다시 시작', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.getByRole('button', { name: '다음 질문', exact: true }).isEnabled(), false);
}
