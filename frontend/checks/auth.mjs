import assert from 'node:assert/strict';

// Run against the local app with cua_repl: await checkAuth(tab).
export async function checkAuth(tab) {
  const page = tab.playwright;
  const snapshot = () => page.domSnapshot();
  const account = () => page.getByRole('button', { name: / · 사용자 메뉴$/ });
  if (await account().count()) {
    await account().click(); await snapshot();
    await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).click(); await snapshot();
  }
  await tab.goto('http://127.0.0.1:8765/#/dashboard'); await snapshot();
  assert.equal(await page.getByRole('heading', { name: '함께 배우고, 함께 만들어가는 공간' }).isVisible(), true);
  assert.equal(await page.locator('#workspace-launcher').count(), 0);
  assert.equal(await page.locator('#chat-sidebar').count(), 0);
  assert.equal(await page.locator('.guest-activity-card').count(), 0, 'Home links to a separate activity page');
  const activitiesLink = page.locator('#global-sidebar').getByRole('link', { name: '활동 목록', exact: true });
  assert.equal(await activitiesLink.getAttribute('href'), '#/activities');
  await page.getByRole('link', { name: '진행중인 활동 따라가기', exact: true }).click(); await snapshot();
  assert.equal(await activitiesLink.getAttribute('aria-current'), 'page');
  assert.equal(await page.getByRole('heading', { name: '지금 진행 중인 활동', exact: true }).isVisible(), true);
  const cards = page.locator('.guest-activity-card');
  assert.ok(await cards.count() > 0, 'Demo activities are discoverable without login');
  for (const card of await cards.all()) {
    assert.equal(await card.getAttribute('href'), '#/login');
    assert.equal(await card.locator('.tag').innerText(), '진행 중');
    assert.ok((await card.getByRole('heading').innerText()).trim());
  }
  await cards.first().click(); await snapshot();
  assert.equal(await page.getByRole('heading', { name: '로그인', exact: true }).isVisible(), true);
  await page.getByRole('link', { name: '홈으로 돌아가기', exact: true }).click(); await snapshot();
  await activitiesLink.click(); await snapshot();
  await tab.reload(); await snapshot();
  assert.equal(await page.getByRole('heading', { name: '지금 진행 중인 활동', exact: true }).isVisible(), true);
  assert.equal(await account().count(), 0, 'The activity list is accessible without login');
  await page.getByRole('link', { name: 'CERT-IS 홈', exact: true }).click(); await snapshot();
  await page.getByRole('link', { name: '로그인하고 시작하기', exact: true }).click(); await snapshot();
  await page.getByRole('button', { name: '로그인', exact: true }).click(); await snapshot();
  assert.equal(await account().count(), 0, 'Empty credentials cannot enter the app');
  await page.getByLabel('아이디', { exact: true }).fill('auth-check');
  await page.getByLabel('비밀번호', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: '로그인', exact: true }).click(); await snapshot();
  assert.match(await page.getByRole('alert').innerText(), /서버 연결 후/);
  assert.equal(await account().count(), 0, 'Credential form never pretends to authenticate');
  assert.equal(await page.getByLabel('비밀번호', { exact: true }).evaluate(el => el.value), '');
  await page.getByRole('combobox', { name: '데모 사용자', exact: true }).selectOption('gitae');
  await page.getByRole('button', { name: '데모 로그인', exact: true }).click(); await snapshot();
  assert.equal(await page.getByRole('button', { name: '기태 · 일반 부원 · 사용자 메뉴', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('heading', { name: '활동', exact: true }).isVisible(), true);
  await tab.reload(); await snapshot();
  assert.equal(await account().isVisible(), true, 'Reload retains the demo session');
  await account().click(); await snapshot();
  assert.equal(await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).isVisible(), true);
  await account().press('Escape'); await snapshot();
  assert.equal(await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).isVisible(), false);
  await tab.goto('http://127.0.0.1:8765/#/workspace/1/calendar'); await snapshot();
  assert.equal(await page.locator('#chat-sidebar').isVisible(), true);
  await account().click(); await snapshot();
  await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).click(); await snapshot();
  assert.equal(await page.locator('#chat-sidebar').count(), 0);
  assert.equal(await page.locator('#workspace-launcher').count(), 0);
  await tab.back(); await snapshot();
  assert.equal(await account().count(), 0, 'Back cannot restore authenticated content');
  for (const route of ['#/workspace/1/document?room=1', '#/settings', '#/calendar', '#/reservation', '#/ai']) {
    await tab.goto(`http://127.0.0.1:8765/${route}`); await snapshot();
    assert.equal(await page.getByRole('heading', { name: '로그인', exact: true }).isVisible(), true);
    assert.equal(await page.getByText('이 화면은 로그인 후 이용할 수 있어요.', { exact: true }).isVisible(), true);
    assert.equal(await page.locator('#chat-sidebar').count(), 0);
    assert.equal(await account().count(), 0);
  }
  await tab.reload(); await snapshot();
  assert.equal(await account().count(), 0, 'Reload after logout stays logged out');
  await tab.goto('http://127.0.0.1:8765/#/login'); await snapshot();
}
