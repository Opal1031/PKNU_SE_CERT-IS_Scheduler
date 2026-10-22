// 백엔드 API 호출. 개발 서버는 로컬 백엔드(127.0.0.1:8000), 배포 빌드는 같은 주소의 /api 를 부른다.
// 다른 주소를 쓰려면 frontend/.env.local 의 VITE_API_URL 로 바꾼다(.env.example 참고).
export const API_URL = (import.meta.env?.VITE_API_URL ?? (import.meta.env?.DEV ? 'http://127.0.0.1:8000' : '')).replace(/\/+$/, '');

export type Role = 'officer' | 'member';
// 아이디 입력 규칙. 서버와 같게 맞춘다(영문·숫자·_.- 3~50자). 비밀번호는 8~128자, 이름은 1~50자.
export const USERNAME_PATTERN = '[A-Za-z0-9_.\\-]{3,50}';
export interface ApiUser {
  id: number; username: string; name: string;
  role: Role; officer: boolean; isActive: boolean; createdAt: string;
}
// 토큰이 만료·위조됐거나 계정이 비활성화되면 서버가 401을 준다. 화면은 이 이벤트를 받아 로그아웃 상태로 바꾼다.
export const SESSION_EXPIRED = 'cert-is:session-expired';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const TOKEN_KEY = 'cert-is-access-token';
// sessionStorage를 쓸 수 없는 환경에서도 현재 탭에서는 로그인이 유지되도록 메모리에 함께 둔다.
let memoryToken: string | null = null;

export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}

function setToken(token: string | null) {
  memoryToken = token;
  try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* 메모리 값만 사용 */ }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${API_URL}${path}`, { ...init, headers }); }
  catch { throw new ApiError('서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해주세요.', 0); }
  if (response.status === 401 && token && path !== '/api/auth/login') expireSession();
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // 서버 오류 형식은 {"detail": "이유"}이고, 입력 형식 오류(422)는 detail이 목록이다.
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(typeof detail === 'string' ? detail : Array.isArray(detail) ? '입력 값을 확인해주세요.' : '요청을 처리하지 못했어요.', response.status);
  }
  return body as T;
}

export async function login(username: string, password: string): Promise<ApiUser> {
  const result = await request<{ accessToken: string; user: ApiUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  setToken(result.accessToken);
  return result.user;
}

export const fetchMe = () => request<ApiUser>('/api/auth/me');

// 회원가입은 승인 대기 계정을 만든다. 임원진이 계정 관리에서 로그인을 허용해야 로그인할 수 있다.
export const signup = (account: { username: string; name: string; password: string }) =>
  request<ApiUser>('/api/auth/signup', { method: 'POST', body: JSON.stringify(account) });

// JWT는 서버에 로그인 상태가 없으므로 토큰을 지우면 로그아웃이다.
export function logout() { setToken(null); }

export function expireSession() {
  setToken(null);
  globalThis.dispatchEvent?.(new Event(SESSION_EXPIRED));
}

// 토큰 본문(payload)의 만료 시각(exp, 초)을 밀리초로 돌려준다. 읽을 수 없으면 null.
export function tokenExpiresAt(token: string | null): number | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const exp: unknown = JSON.parse(atob(base64)).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch { return null; }
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>('/api/users/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });

// 임원진 전용 계정 관리: 가입 승인, 계정 발급, 아이디·이름·역할·로그인 허용 변경, 비밀번호 초기화.
export const listAccounts = () => request<ApiUser[]>('/api/admin/users');
export const createAccount = (account: { username: string; name: string; password: string; role: Role }) =>
  request<ApiUser>('/api/admin/users', { method: 'POST', body: JSON.stringify(account) });
export const updateAccount = (id: number, changes: Partial<Pick<ApiUser, 'username' | 'name' | 'role' | 'isActive'>>) =>
  request<ApiUser>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
export const resetPassword = (id: number, newPassword: string) =>
  request<void>(`/api/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
