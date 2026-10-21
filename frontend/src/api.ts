// 백엔드 API 호출. 주소는 frontend/.env 의 VITE_API_URL 로 바꾼다(.env.example 참고).
export const API_URL = (import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
// 데모 로그인·사용자 미리보기 같은 검토 도구는 개발 서버(pnpm dev)에서만 보여 준다.
export const DEMO_TOOLS = import.meta.env?.DEV ?? false;

export interface ApiUser {
  id: number; username: string; name: string;
  role: 'officer' | 'member'; officer: boolean; isActive: boolean; createdAt: string;
}

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

// JWT는 서버에 로그인 상태가 없으므로 토큰을 지우면 로그아웃이다.
export function logout() { setToken(null); }
