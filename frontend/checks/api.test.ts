// api.ts의 토큰 처리 테스트: JWT 만료 시각 읽기, 서버가 토큰을 거절(401)할 때의 세션 만료 처리.
// fetch와 전역 dispatchEvent를 바꿔 끼워 백엔드 없이 node --test로 실행한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePassword, getToken, login, SESSION_EXPIRED, tokenExpiresAt } from '../src/api.ts';

// 발생한 이벤트 이름을 모아 세션 만료 알림 여부를 확인한다.
const events: string[] = [];
Object.defineProperty(globalThis, 'dispatchEvent', {
  value: (event: Event) => {
    events.push(event.type);
    return true;
  },
  configurable: true
});

// 만료 시각은 payload만 읽으므로 가짜 서명을 붙인 JWT 모양의 토큰을 만든다.
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (payload: object) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
// 다음 fetch가 돌려줄 응답(상태 코드·본문)을 정한다.
function respond(status: number, body?: unknown) {
  globalThis.fetch = async () => new Response(body === undefined ? null : JSON.stringify(body), { status });
}

test('토큰의 만료 시각(exp)을 밀리초로 읽음', () => {
  assert.equal(tokenExpiresAt(token({ sub: '1', exp: 1_800_000_000 })), 1_800_000_000_000);
  // base64url의 -, _ 문자와 패딩 없는 길이도 읽음
  assert.equal(tokenExpiresAt(token({ sub: '한글?>>', exp: 42 })), 42_000);
  for (const broken of [null, '', 'abc', 'a.b.c', token({ sub: '1' })]) assert.equal(tokenExpiresAt(broken), null);
});

test('로그인 후 서버가 토큰을 거절(401)하면 토큰을 지우고 세션 만료를 알림', async () => {
  respond(200, {
    accessToken: token({ exp: 9_999_999_999 }),
    tokenType: 'bearer',
    user: { id: 1, username: 'alice', name: 'alice', role: 'member', officer: false, isActive: true, createdAt: '' }
  });
  await login('alice', 'password123');
  assert.ok(getToken());
  respond(401, { detail: '로그인이 필요함' });
  await assert.rejects(changePassword('password123', 'newpass123'), /로그인이 필요함/);
  assert.equal(getToken(), null);
  assert.deepEqual(events, [SESSION_EXPIRED]);
});

test('로그인 실패(401)나 다른 오류는 세션 만료로 보지 않음', async () => {
  events.length = 0;
  respond(401, { detail: '아이디 또는 비밀번호가 올바르지 않음' });
  await assert.rejects(login('alice', 'wrong'), /올바르지 않음/);
  respond(200, {
    accessToken: token({ exp: 9_999_999_999 }),
    tokenType: 'bearer',
    user: { id: 1, username: 'alice', name: 'alice', role: 'member', officer: false, isActive: true, createdAt: '' }
  });
  await login('alice', 'password123');
  respond(400, { detail: '현재 비밀번호가 올바르지 않음' });
  await assert.rejects(changePassword('wrong', 'newpass123'), /현재 비밀번호/);
  assert.ok(getToken());
  assert.deepEqual(events, []);
});
