// 로그인·회원가입과 비로그인 화면 브라우저 점검(checkAuth). 로그인 실패 처리, 접근 제한,
// 실제 계정으로 로그인·새로고침 유지·로그아웃까지 확인한다.
import assert from 'node:assert/strict';

// Run against the local app (pnpm dev + 백엔드) with cua_repl:
//   await checkAuth(tab, { username: 'kitae', password: '…' })
// 계정 정보를 넘기지 않으면 비로그인 화면·로그인 실패·회원가입 화면까지만 검사한다.
export async function checkAuth(tab, credentials) {
  const page = tab.playwright;
  // snapshot: 화면 상태 다시 읽기, account: 로그인했을 때만 있는 상단 계정 메뉴 버튼
  const snapshot = () => page.domSnapshot();
  const account = () => page.getByRole('button', { name: / · 사용자 메뉴$/ });
  // 이미 로그인돼 있으면 먼저 로그아웃
  if (await account().count()) {
    await account().click();
    await snapshot();
    await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).click();
    await snapshot();
  }
  // 비로그인 홈과 로그인 없이 보는 진행 중 활동 목록(카드는 로그인 화면으로 연결)
  await tab.goto('http://127.0.0.1:8765/#/dashboard');
  await snapshot();
  assert.equal(await page.getByRole('heading', { name: '함께 배우고, 함께 만들어가는 공간' }).isVisible(), true);
  assert.equal(await page.locator('#workspace-launcher').count(), 0);
  assert.equal(await page.locator('#chat-sidebar').count(), 0);
  assert.equal(await page.locator('.guest-activity-card').count(), 0, 'Home links to a separate activity page');
  const activitiesLink = page.locator('#global-sidebar').getByRole('link', { name: '활동 목록', exact: true });
  assert.equal(await activitiesLink.getAttribute('href'), '#/activities');
  await page.getByRole('link', { name: '진행중인 활동 따라가기', exact: true }).click();
  await snapshot();
  assert.equal(await activitiesLink.getAttribute('aria-current'), 'page');
  assert.equal(await page.getByRole('heading', { name: '지금 진행 중인 활동', exact: true }).isVisible(), true);
  const cards = page.locator('.guest-activity-card');
  assert.ok((await cards.count()) > 0, 'Demo activities are discoverable without login');
  for (const card of await cards.all()) {
    assert.equal(await card.getAttribute('href'), '#/login');
    assert.equal(await card.locator('.tag').innerText(), '진행 중');
    assert.ok((await card.getByRole('heading').innerText()).trim());
  }
  await cards.first().click();
  await snapshot();
  assert.equal(await page.getByRole('heading', { name: '로그인', exact: true }).isVisible(), true);
  await page.getByRole('link', { name: '홈으로 돌아가기', exact: true }).click();
  await snapshot();
  await activitiesLink.click();
  await snapshot();
  await tab.reload();
  await snapshot();
  assert.equal(await page.getByRole('heading', { name: '지금 진행 중인 활동', exact: true }).isVisible(), true);
  assert.equal(await account().count(), 0, 'The activity list is accessible without login');
  // 로그인 실패: 빈 입력·틀린 계정은 들어가지 못하고 비밀번호 칸은 비워짐, 데모 로그인 없음
  await page.getByRole('link', { name: 'CERT-IS 홈', exact: true }).click();
  await snapshot();
  await page.getByRole('link', { name: '로그인하고 시작하기', exact: true }).click();
  await snapshot();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await snapshot();
  assert.equal(await account().count(), 0, 'Empty credentials cannot enter the app');
  await page.getByLabel('아이디', { exact: true }).fill('auth-check');
  await page.getByLabel('비밀번호', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await snapshot();
  // 백엔드가 켜져 있으면 인증 실패, 꺼져 있으면 연결 실패 안내가 보인다.
  assert.match(
    await page.getByRole('alert').innerText(),
    /아이디 또는 비밀번호가 올바르지 않음|서버에 연결할 수 없어요/
  );
  assert.equal(await account().count(), 0, 'Credential form never pretends to authenticate');
  assert.equal(await page.getByLabel('비밀번호', { exact: true }).evaluate(el => el.value), '');
  assert.equal(await page.getByRole('button', { name: '데모 로그인' }).count(), 0, 'Demo login was removed');
  // 회원가입: 비밀번호 확인이 다르면 서버로 보내지 않고 오류 표시
  await page.getByRole('link', { name: '회원가입', exact: true }).click();
  await snapshot();
  assert.equal(await page.getByRole('heading', { name: '회원가입', exact: true }).isVisible(), true);
  await page.getByLabel('비밀번호 (8자 이상)', { exact: true }).fill('password-one');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('password-two');
  await page.getByLabel('아이디 (영문·숫자·_.- 3~50자)', { exact: true }).fill('signup-check');
  await page.getByLabel('이름', { exact: true }).fill('가입 검사');
  await page.getByRole('button', { name: '가입 신청', exact: true }).click();
  await snapshot();
  assert.match(
    await page.getByRole('alert').innerText(),
    /비밀번호와 확인 값이 달라요/,
    'Mismatched passwords never reach the server'
  );
  await page.getByRole('link', { name: '로그인', exact: true }).last().click();
  await snapshot();
  // 이후는 실제 계정이 있을 때만: 로그인, 새로고침 유지, 계정 메뉴 열고 닫기
  if (!credentials) return;
  await page.getByLabel('아이디', { exact: true }).fill(credentials.username);
  await page.getByLabel('비밀번호', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await snapshot();
  assert.equal(await account().isVisible(), true, 'A real account can sign in');
  assert.equal(await page.getByRole('heading', { name: '활동', exact: true }).isVisible(), true);
  await tab.reload();
  await snapshot();
  assert.equal(await account().isVisible(), true, 'Reload retains the server session');
  await account().click();
  await snapshot();
  assert.equal(
    await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).isVisible(),
    true
  );
  await account().press('Escape');
  await snapshot();
  assert.equal(
    await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).isVisible(),
    false
  );
  // 로그아웃하면 채팅·활동 선택 버튼이 사라지고 뒤로 가기로도 되살아나지 않음
  await tab.goto('http://127.0.0.1:8765/#/workspace/1/calendar');
  await snapshot();
  assert.equal(await page.locator('#chat-sidebar').isVisible(), true);
  await account().click();
  await snapshot();
  await page.locator('.account-panel').getByRole('button', { name: '로그아웃', exact: true }).click();
  await snapshot();
  assert.equal(await page.locator('#chat-sidebar').count(), 0);
  assert.equal(await page.locator('#workspace-launcher').count(), 0);
  await tab.back();
  await snapshot();
  assert.equal(await account().count(), 0, 'Back cannot restore authenticated content');
  // 로그인이 필요한 경로는 모두 로그인 화면과 접근 안내로 바뀜
  for (const route of ['#/workspace/1/document?room=1', '#/settings', '#/calendar', '#/reservation', '#/ai']) {
    await tab.goto(`http://127.0.0.1:8765/${route}`);
    await snapshot();
    assert.equal(await page.getByRole('heading', { name: '로그인', exact: true }).isVisible(), true);
    assert.equal(await page.getByText('이 화면은 로그인 후 이용할 수 있어요.', { exact: true }).isVisible(), true);
    assert.equal(await page.locator('#chat-sidebar').count(), 0);
    assert.equal(await account().count(), 0);
  }
  await tab.reload();
  await snapshot();
  assert.equal(await account().count(), 0, 'Reload after logout stays logged out');
  await tab.goto('http://127.0.0.1:8765/#/login');
  await snapshot();
}
