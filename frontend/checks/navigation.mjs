import assert from 'node:assert/strict';

// Run with the local app's cua_repl tab: await checkNavigation(tab).
export async function checkNavigation(tab) {
  const page = tab.playwright;
  for (const label of ['CERT-IS 홈', '달력', '예약', 'AI 설문']) {
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await page.domSnapshot();
    assert.equal(await page.locator('#chat-sidebar').count(), 0, `${label}: no activity chat`);
    assert.equal(await page.getByRole('link', { name: label, exact: true }).first().getAttribute('aria-current'), 'page');
  }
  assert.equal(await page.locator('#global-sidebar').getByRole('link', { name: '홈', exact: true }).count(), 0);
  assert.equal(await page.locator('.brand-logo').evaluate(el => el.complete && el.naturalWidth > 0), true);
  assert.equal(await page.locator('.nav-divider span').count(), 2);
  await page.getByRole('button', { name: '프로젝트 및 스터디 생성', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.getByRole('heading', { name: '활동 생성', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '닫기', exact: true }).first().click();
  await page.getByRole('button', { name: '프로젝트 및 스터디', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.evaluate(() => document.querySelector('#modal')?.matches(':popover-open')), true);
  assert.equal(await page.evaluate(() => document.querySelector('#modal')?.matches(':modal')), false);
  const layout = await page.evaluate(() => { const popup = document.querySelector('#modal').getBoundingClientRect(), launcher = document.querySelector('#workspace-launcher').getBoundingClientRect(); return { width: popup.width, left: popup.left, right: popup.right, top: popup.top, bottom: popup.bottom, launcherRight: launcher.right, viewport: window.innerWidth, viewportHeight: window.innerHeight, columns: getComputedStyle(document.querySelector('.activity-grid')).gridTemplateColumns.split(' ').length }; });
  assert.ok(layout.width <= 321 && layout.left > layout.launcherRight && layout.right <= layout.viewport);
  assert.ok(layout.top >= 0 && layout.bottom <= layout.viewportHeight);
  assert.equal(layout.columns, 3);
  assert.equal(await page.getByRole('region', { name: '프로젝트', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('region', { name: '스터디', exact: true }).isVisible(), true);
  assert.equal(await page.locator('#modal').getByRole('button', { name: '프로젝트 및 스터디 생성', exact: true }).count(), 1);
  await page.getByRole('button', { name: '프로젝트 및 스터디 생성', exact: true }).last().click();
  await page.domSnapshot();
  assert.equal(await page.getByRole('heading', { name: '활동 생성', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '닫기', exact: true }).first().click();
  await page.getByRole('button', { name: '프로젝트 및 스터디', exact: true }).click();
  await page.getByRole('button', { name: '활동 검색', exact: true }).click();
  await page.domSnapshot();
  const search = page.getByRole('searchbox', { name: '프로젝트 및 스터디 검색' });
  await search.fill('없는활동-navigation-check');
  await page.domSnapshot();
  assert.equal(await page.locator('.activity-tile').count(), 0);
  assert.equal(await page.getByText('일치하는 프로젝트가 없습니다.', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('일치하는 스터디가 없습니다.', { exact: true }).isVisible(), true);
  await search.press('Escape');
  await page.domSnapshot();
  assert.equal(await page.locator('#modal').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'workspace-launcher');
  await page.getByRole('button', { name: '프로젝트 및 스터디', exact: true }).click();
  await page.domSnapshot();
  await page.getByRole('link', { name: '예약', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('#modal').count(), 0, 'Clicking outside dismisses the picker');
  assert.equal(await page.locator('#workspace-launcher').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#/reservation', 'Outside link keeps keyboard focus');
  await page.getByRole('button', { name: '프로젝트 및 스터디', exact: true }).click();
  await page.domSnapshot();
  const study = page.getByRole('link', { name: '네트워크 보안 · 스터디', exact: true });
  await study.click();
  await page.domSnapshot();
  assert.equal(await page.locator('#modal').count(), 0);
  assert.equal(await page.locator('#chat-sidebar').isVisible(), true);
  assert.ok((await page.locator('#chat-sidebar').innerText({})).includes('네트워크 보안'));
  await page.getByRole('button', { name: '프로젝트 및 스터디', exact: true }).click();
  await page.domSnapshot();
  await page.getByRole('link', { name: '네트워크 보안 · 스터디', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('#modal').count(), 0, 'Selecting the current activity still closes the picker');
  await page.getByRole('link', { name: 'CERT-IS 홈', exact: true }).click();
  await page.domSnapshot();
  assert.equal(await page.locator('#chat-sidebar').count(), 0);
}

// Open /checks/activity-names.html, then await checkActivityNames(tab).
export async function checkActivityNames(tab) {
  const page = tab.playwright;
  await page.getByRole('button', { name: '이름 확인', exact: true }).click();
  await page.domSnapshot();
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('.activity-name')).map(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth, wordBreak: getComputedStyle(el).wordBreak, wrap: getComputedStyle(el).textWrap })));
  assert.equal(names.length, 3);
  assert.ok(names.every(x => x.height === 36 && x.wordBreak === 'keep-all' && x.wrap === 'balance'));
  assert.equal(names[0].scrollHeight, names[0].height);
  assert.ok(names[1].scrollHeight > names[1].height && names[2].scrollHeight > names[2].height);
  assert.equal(names[2].scrollWidth, names[2].width, 'Unbroken English names stay within their tile');
  // Dialog initially focuses search; two tabs pass create and close, then reach the first tile.
  await page.getByRole('button', { name: '활동 검색', exact: true }).press('Tab');
  await page.getByRole('button', { name: '프로젝트 및 스터디 생성', exact: true }).press('Tab');
  await page.getByRole('button', { name: '닫기', exact: true }).press('Tab');
  await page.domSnapshot();
  assert.equal(await page.locator('.activity-tooltip:popover-open').count(), 0, 'Short names need no tooltip');
  await page.getByRole('link', { name: '짧은 이름 · 프로젝트', exact: true }).press('Tab');
  await page.domSnapshot();
  const tooltip = page.locator('.activity-tooltip:popover-open');
  assert.equal(await tooltip.innerText({}), 'CERT-IS 통합 관리 및 네트워크 보안 취약점 분석 프로젝트');
  const bounds = await tooltip.evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: window.innerWidth, height: window.innerHeight }; });
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, 'Tooltip stays in the viewport');
  await page.getByRole('link', { name: 'CERT-IS 통합 관리 및 네트워크 보안 취약점 분석 프로젝트 · 프로젝트', exact: true }).press('Escape');
  await page.domSnapshot();
  assert.equal(await tooltip.count(), 0);
  assert.equal(await page.evaluate(() => document.querySelector('#modal')?.matches(':popover-open')), true, 'Dismissing the tooltip keeps the picker open');
  await page.getByRole('link', { name: 'CERT-IS 통합 관리 및 네트워크 보안 취약점 분석 프로젝트 · 프로젝트', exact: true }).press('Tab');
  await page.domSnapshot();
  assert.equal(await tooltip.count(), 1, 'Next long name appears on keyboard focus');
  await page.getByRole('link', { name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ · 프로젝트', exact: true }).press('Enter');
  await page.domSnapshot();
  assert.equal(await page.locator('#modal').count(), 0);
  assert.equal(await tooltip.count(), 0, 'Navigating removes the tooltip');
}
