// 백엔드 API 호출. 개발 서버는 로컬 백엔드(127.0.0.1:8000), 배포 빌드는 같은 주소의 /api 를 부른다.
// 다른 주소를 쓰려면 frontend/.env.local 의 VITE_API_URL 로 바꾼다(.env.example 참고).
export const API_URL = (import.meta.env?.VITE_API_URL ?? (import.meta.env?.DEV ? 'http://127.0.0.1:8000' : '')).replace(
  /\/+$/,
  ''
);

/** 서버 계정 역할: 임원진(officer) 또는 일반 부원(member). */
export type Role = 'officer' | 'member';
// 아이디 입력 규칙. 서버와 같게 맞춘다(영문·숫자·_.- 3~50자). 비밀번호는 8~128자, 이름은 1~50자.
export const USERNAME_PATTERN = '[A-Za-z0-9_.\\-]{3,50}';
/** 서버가 돌려주는 계정 정보. */
export interface ApiUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  officer: boolean;
  isActive: boolean;
  createdAt: string;
}
// 토큰이 만료·위조됐거나 계정이 비활성화되면 서버가 401을 준다. 화면은 이 이벤트를 받아 로그아웃 상태로 바꾼다.
export const SESSION_EXPIRED = 'cert-is:session-expired';

/** HTTP 상태 코드를 함께 담는 API 오류. 서버에 연결하지 못하면 status 는 0. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 접근 토큰(JWT)은 sessionStorage 에 두어 탭을 닫으면 사라진다.
const TOKEN_KEY = 'cert-is-access-token';
// sessionStorage를 쓸 수 없는 환경에서도 현재 탭에서는 로그인이 유지되도록 메모리에 함께 둔다.
let memoryToken: string | null = null;

/** 저장된 접근 토큰. 없으면 null. */
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

// 토큰을 메모리와 sessionStorage 에 함께 저장한다. null 이면 지운다.
function setToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 메모리 값만 사용 */
  }
}

// 공통 요청 함수. 토큰을 붙여 JSON 으로 주고받고, 실패 응답은 ApiError 로 바꿔 던진다.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // 요청 헤더: 본문이 있으면 JSON 형식, 로그인 상태면 Bearer 토큰
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해주세요.', 0);
  }
  // 로그인 요청이 아닌데 보낸 토큰이 거절되면 세션 만료 처리. 204는 본문 없음.
  if (response.status === 401 && token && path !== '/api/auth/login') expireSession();
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // 서버 오류 형식은 {"detail": "이유"}이고, 입력 형식 오류(422)는 detail이 목록이다.
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? '입력 값을 확인해주세요.'
          : '요청을 처리하지 못했어요.',
      response.status
    );
  }
  return body as T;
}

/** 로그인하고 받은 접근 토큰을 저장한 뒤 계정 정보를 돌려준다. */
export async function login(username: string, password: string): Promise<ApiUser> {
  const result = await request<{ accessToken: string; user: ApiUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  setToken(result.accessToken);
  return result.user;
}

/** 현재 토큰의 계정 정보 조회. */
export const fetchMe = () => request<ApiUser>('/api/auth/me');

// 회원가입은 승인 대기 계정을 만든다. 임원진이 계정 관리에서 로그인을 허용해야 로그인할 수 있다.
export const signup = (account: { username: string; name: string; password: string }) =>
  request<ApiUser>('/api/auth/signup', { method: 'POST', body: JSON.stringify(account) });

// JWT는 서버에 로그인 상태가 없으므로 토큰을 지우면 로그아웃이다.
export function logout() {
  setToken(null);
}

/** 토큰을 지우고 SESSION_EXPIRED 이벤트를 보내 화면을 로그아웃 상태로 돌린다. */
export function expireSession() {
  setToken(null);
  globalThis.dispatchEvent?.(new Event(SESSION_EXPIRED));
}

// 토큰 본문(payload)의 만료 시각(exp, 초)을 밀리초로 돌려준다. 읽을 수 없으면 null.
export function tokenExpiresAt(token: string | null): number | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const exp: unknown = JSON.parse(atob(base64)).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** 내 비밀번호 변경(현재 비밀번호 확인 필요). */
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

// ──────────────────────────────────────────────────────────────────────────
// 활동·회의록·예약·캘린더·채팅 API
//
// 서버가 주는 형식을 그대로 담는다. 화면이 쓰는 model.ts 형식과는 ID 타입(서버는 숫자)과
// 시간 표현(예약은 자정 기준 분)이 달라, 변환은 serverModel.ts 가 맡는다.
// ──────────────────────────────────────────────────────────────────────────

/** 활동 유형·상태. 서버 Enum 과 같게 맞춘다. */
export type WorkspaceType = 'project' | 'study';
export type WorkspaceStatus = '계획' | '진행 중' | '보류' | '완료' | '보관';
/** 요청자와 활동의 관계. 팀장 / 팀원 / 미참여(임원진 운영 조회). */
export type MyRole = 'leader' | 'member' | 'viewer';

export interface ApiWorkspace {
  id: number;
  type: WorkspaceType;
  name: string;
  initial: string;
  field: string;
  status: WorkspaceStatus;
  goal: string;
  startDate: string | null;
  endDate: string | null;
  leaderId: number;
  createdBy: number;
  memberIds: number[];
  updatedAt: string;
  myRole: MyRole;
}

/** 비로그인 화면에 공개하는 활동 정보. 구성원·기간 같은 내부 정보는 서버가 빼고 보낸다. */
export interface ApiPublicWorkspace {
  id: number;
  type: WorkspaceType;
  name: string;
  initial: string;
  field: string;
  status: WorkspaceStatus;
  goal: string;
}

/** 활동 목록 필터. 지정한 것끼리 AND 로 묶인다. */
export interface WorkspaceFilter {
  scope?: 'mine' | 'all';
  type?: WorkspaceType;
  field?: string;
  status?: string;
  leaderId?: number;
  q?: string;
  order?: 'id' | 'name' | 'updated';
}

// 값이 있는 항목만 쿼리 문자열로 만든다(빈 값을 보내면 서버가 필터로 인식한다).
function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const listWorkspaces = (filter: WorkspaceFilter = {}) =>
  request<ApiWorkspace[]>(`/api/workspaces${query({ ...filter })}`);
export const getWorkspace = (id: number) => request<ApiWorkspace>(`/api/workspaces/${id}`);
/** 진행 중인 활동 소개(로그인 없이 호출 가능). */
export const listPublicWorkspaces = () => request<ApiPublicWorkspace[]>('/api/public/workspaces');

export interface WorkspaceCreate {
  type: WorkspaceType;
  name: string;
  initial: string;
  field: string;
  goal?: string;
  status?: WorkspaceStatus;
  startDate?: string | null;
  endDate?: string | null;
  memberIds?: number[];
}
export const createWorkspace = (body: WorkspaceCreate) =>
  request<ApiWorkspace>('/api/workspaces', { method: 'POST', body: JSON.stringify(body) });

export const updateWorkspace = (id: number, changes: Partial<Omit<WorkspaceCreate, 'type' | 'memberIds'>>) =>
  request<ApiWorkspace>(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });

/** 구성원 교체와 팀장 위임. leaderId 는 반드시 memberIds 안에 있어야 한다. */
export const updateWorkspaceMembers = (id: number, memberIds: number[], leaderId: number) =>
  request<ApiWorkspace>(`/api/workspaces/${id}/members`, {
    method: 'PUT',
    body: JSON.stringify({ memberIds, leaderId })
  });

/** 활동 나가기. 팀장은 먼저 위임해야 한다(400). */
export const leaveWorkspace = (id: number) => request<void>(`/api/workspaces/${id}/leave`, { method: 'POST' });

/** 참가 신청. 종료·보관 활동은 400, 중복 신청은 409. */
export const applyToWorkspace = (id: number) =>
  request<{ id: number; workspaceId: number; userId: number; status: string; createdAt: string }>(
    `/api/workspaces/${id}/applications`,
    { method: 'POST' }
  );

/** 활동 보관(팀장·임원진). 조회 전용이 된다. 되돌리려면 updateWorkspace 로 상태를 바꾼다. */
export const archiveWorkspace = (id: number) =>
  request<ApiWorkspace>(`/api/workspaces/${id}/archive`, { method: 'POST' });

// --- 회의록 ---------------------------------------------------------------

export interface ApiDocument {
  roomId: number;
  body: string;
  version: number;
  updatedBy: number;
  updatedAt: string;
}
export interface ApiDocumentVersion {
  version: number;
  body: string;
  updatedBy: number;
  updatedAt: string;
}
/** 저장 충돌(409) 때 서버가 함께 주는 현재 상태. 화면이 비교·병합에 쓴다. */
export interface DocumentConflict {
  detail: string;
  currentVersion: number;
  currentBody: string;
  updatedBy: number;
  updatedAt: string;
}
/** 저장이 충돌하면 던지는 오류. 현재 내용을 들고 있어 화면이 사용자 글을 잃지 않게 한다. */
export class DocumentConflictError extends ApiError {
  readonly current: DocumentConflict;
  constructor(current: DocumentConflict) {
    super(current.detail, 409);
    this.current = current;
  }
}

export const fetchDocument = (roomId: number) => request<ApiDocument>(`/api/rooms/${roomId}/document`);
export const fetchDocumentVersions = (roomId: number) =>
  request<ApiDocumentVersion[]>(`/api/rooms/${roomId}/document/versions`);

/** 회의록 저장. baseVersion 이 서버의 현재 version 과 다르면 DocumentConflictError 를 던진다. */
export async function saveDocument(roomId: number, body: string, baseVersion: number): Promise<ApiDocument> {
  try {
    return await request<ApiDocument>(`/api/rooms/${roomId}/document`, {
      method: 'PUT',
      body: JSON.stringify({ body, baseVersion })
    });
  } catch (error) {
    // 409 응답 본문은 소비되어 버렸으므로, 최신 내용을 한 번 더 받아 와 충돌 정보를 만든다.
    if (error instanceof ApiError && error.status === 409) {
      const latest = await fetchDocument(roomId);
      throw new DocumentConflictError({
        detail: '다른 사람이 먼저 저장했어요. 최신 내용을 확인하고 다시 저장해주세요.',
        currentVersion: latest.version,
        currentBody: latest.body,
        updatedBy: latest.updatedBy,
        updatedAt: latest.updatedAt
      });
    }
    throw error;
  }
}

// --- 동아리방 예약 ---------------------------------------------------------

export interface ApiReservation {
  id: number;
  workspaceId: number;
  workspaceName: string;
  ownerId: number;
  date: string;
  /** 자정 기준 분. 540=09:00, 1440=24:00 */
  startMinute: number;
  endMinute: number;
  /** 다른 활동의 예약이면 null 로 가려진다. */
  purpose: string | null;
  status: '확정' | '취소';
  cancelReason: string | null;
  canEdit: boolean;
  updatedAt: string;
}

export const listReservations = (from: string, to: string, includeCancelled = false) =>
  request<ApiReservation[]>(`/api/reservations${query({ from, to, includeCancelled: includeCancelled || undefined })}`);

export const createReservation = (body: {
  workspaceId: number;
  date: string;
  startMinute: number;
  endMinute: number;
  purpose: string;
}) => request<ApiReservation>('/api/reservations', { method: 'POST', body: JSON.stringify(body) });

export const updateReservation = (
  id: number,
  changes: { date?: string; startMinute?: number; endMinute?: number; purpose?: string }
) => request<ApiReservation>(`/api/reservations/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });

/** 예약 취소. 시간은 즉시 풀리고 취소 기록은 남는다. */
export const cancelReservation = (id: number, reason: string) =>
  request<ApiReservation>(`/api/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });

// --- 캘린더·일정 -----------------------------------------------------------

export type EventVisibility = 'club' | 'workspace' | 'private';
export type EventStatus = '예정' | '진행 중' | '완료' | '보류';

export interface ApiEvent {
  id: number;
  workspaceId: number | null;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  visibility: EventVisibility;
  status: EventStatus;
  work: string;
  assigneeIds: number[];
  createdBy: number;
  canEdit: boolean;
  updatedAt: string;
}
/** 캘린더에 함께 그리는 예약(확정 건만). */
export interface ApiCalendarReservation {
  id: number;
  workspaceId: number;
  workspaceName: string;
  ownerId: number;
  date: string;
  startMinute: number;
  endMinute: number;
  purpose: string | null;
}
export interface ApiCalendar {
  events: ApiEvent[];
  reservations: ApiCalendarReservation[];
}

/** 기간에 걸치는 일정과 그 기간의 확정 예약을 한 번에 가져온다. */
export const fetchCalendar = (from: string, to: string, options: { workspaceId?: number; mine?: boolean } = {}) =>
  request<ApiCalendar>(
    `/api/calendar${query({ from, to, workspaceId: options.workspaceId, mine: options.mine || undefined })}`
  );

export interface EventCreate {
  workspaceId?: number | null;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  visibility?: EventVisibility;
  status?: EventStatus;
  work?: string;
  assigneeIds?: number[];
}
export const createEvent = (body: EventCreate) =>
  request<ApiEvent>('/api/events', { method: 'POST', body: JSON.stringify(body) });

/** 일정 수정. 공개 범위와 소속 활동은 바꿀 수 없다(권한 경계가 흔들리므로 서버가 받지 않는다). */
export const updateEvent = (id: number, changes: Partial<Omit<EventCreate, 'workspaceId' | 'visibility'>>) =>
  request<ApiEvent>(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });

/** 일정 삭제. 행은 남고 deleted_at 이 기록되는 소프트 삭제다. */
export const deleteEvent = (id: number) => request<void>(`/api/events/${id}`, { method: 'DELETE' });

// --- 채팅방·메시지·태그 ----------------------------------------------------

export interface ApiRoom {
  id: number;
  workspaceId: number;
  name: string;
  archived: boolean;
  memberIds: number[];
  tagIds: number[];
  createdBy: number;
  createdAt: string;
}
export interface ApiMessage {
  id: number;
  roomId: number;
  authorId: number;
  body: string;
  createdAt: string;
}

/** 내가 참여한 방만 돌려준다. 활동 구성원이라도 초대되지 않은 방은 보이지 않는다. */
export const listRooms = (workspaceId: number, includeArchived = false) =>
  request<ApiRoom[]>(`/api/workspaces/${workspaceId}/rooms${query({ includeArchived: includeArchived || undefined })}`);

export const createRoom = (workspaceId: number, body: { name: string; memberIds?: number[]; tagIds?: number[] }) =>
  request<ApiRoom>(`/api/workspaces/${workspaceId}/rooms`, { method: 'POST', body: JSON.stringify(body) });

export const updateRoom = (
  roomId: number,
  changes: { name?: string; memberIds?: number[]; tagIds?: number[]; archived?: boolean }
) => request<ApiRoom>(`/api/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(changes) });

/**
 * 메시지 조회. 항상 오래된 것부터 정렬된다.
 * - before: 위로 스크롤해 과거를 더 불러올 때
 * - after: 새 메시지만 가져올 때(배포 환경의 실시간 수신 경로)
 */
export const listMessages = (roomId: number, options: { before?: number; after?: number; limit?: number } = {}) =>
  request<ApiMessage[]>(`/api/rooms/${roomId}/messages${query({ ...options })}`);

export const sendMessage = (roomId: number, body: string) =>
  request<ApiMessage>(`/api/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });

export interface ApiTag {
  id: number;
  groupId: number;
  name: string;
  position: number;
}
export interface ApiTagGroup {
  id: number;
  workspaceId: number;
  name: string;
  position: number;
  tags: ApiTag[];
}

export const listTagGroups = (workspaceId: number) =>
  request<ApiTagGroup[]>(`/api/workspaces/${workspaceId}/tag-groups`);
export const createTagGroup = (workspaceId: number, name: string, position = 0) =>
  request<ApiTagGroup>(`/api/workspaces/${workspaceId}/tag-groups`, {
    method: 'POST',
    body: JSON.stringify({ name, position })
  });
export const createTag = (groupId: number, name: string, position = 0) =>
  request<ApiTagGroup>(`/api/tag-groups/${groupId}/tags`, { method: 'POST', body: JSON.stringify({ name, position }) });
export const deleteTag = (tagId: number) => request<void>(`/api/tags/${tagId}`, { method: 'DELETE' });

/** 활동에 참여 중인(또는 지정 가능한) 사용자 목록. 구성원 선택 화면에서 쓴다. */
export const listUsers = () => request<{ id: number; name: string }[]>('/api/users');
