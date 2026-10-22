// 프론트엔드 자료 모델과 브라우저 저장소. 활동·방·일정·예약·회의록 자료를 localStorage 에
// 보관하고, 권한 판정·입력 검증과 대화상자 폼 변경 처리(applyForm), 화면 설정 저장을 맡는다.
import seed from './seed.json' with { type: 'json' };
import { isSurveyAnswer, surveyQuestions } from './recommend.ts';
import type { SurveyAnswer } from './recommend';

/** 자료 ID(샘플 자료는 숫자, 새로 만든 자료는 문자열)와 현재 사용자 세션(사용자 ID, 임원진 여부). */
export type Id = string | number;
export type Session = { userId: string; officer: boolean };
/** 활동 분야와 진행 상태 선택지. */
export const fields = ['웹 보안', '네트워크', '암호학', '시스템 보안'];
export const statuses = ['계획', '진행 중', '보류', '완료', '보관'];
/** 로컬 사용자 목록(샘플 구성원). 로그인한 서버 계정은 localUserId 로 여기에 연결된다. */
export const users = [
  { id: 'me', name: '나' },
  { id: 'gitae', name: '기태' },
  { id: 'minseo', name: '민서' },
  { id: 'hyelim', name: '혜림' },
  { id: 'jisu', name: '지수' },
  { id: 'doyun', name: '도윤' },
  { id: 'subin', name: '수빈' }
];
// ponytail: 활동·일정 API가 연결되기 전까지 서버 계정을 로컬 샘플 사용자 ID로 연결한다.
// 서버 아이디가 샘플 ID와 다른 계정만 따로 잇고(demo → 나, kitae → 기태, hyerim → 혜림),
// 샘플에 없는 계정은 구성원이 아닌 사용자로 추가한다.
const LOCAL_ALIASES: Record<string, string> = { demo: 'me', kitae: 'gitae', hyerim: 'hyelim' };
export function localUserId(account: { username: string; name: string }) {
  const userId = LOCAL_ALIASES[account.username] ?? account.username;
  if (!users.some(u => u.id === userId)) users.push({ id: userId, name: account.name });
  return userId;
}

/** 활동(프로젝트·스터디). 구성원·팀장·목표·기간·진행 상태를 가진다. */
export interface Workspace {
  id: Id;
  name: string;
  type: 'project' | 'study';
  initial: string;
  field: string;
  status: string;
  memberIds: string[];
  leaderId: string;
  createdBy: string;
  goal: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
  // ponytail: local demo requests; use an authenticated API when server participation is connected.
  applicantIds?: string[];
  memberNames?: string[];
  description?: string;
  members?: number;
}
/** 채팅 메시지. */
export interface Message {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
  name?: string;
  time?: string;
}
/** 활동 안의 방(채팅방). 방마다 회의록 문서가 하나씩 연결되고 태그로 분류한다. */
export interface Room {
  id: Id;
  workspaceId: Id;
  name: string;
  memberIds: string[];
  tagIds: string[];
  messages: Message[];
  createdAt: string;
  createdBy?: string;
  archived?: boolean;
  members?: string[];
  week?: string;
  topic?: string;
}
/** 일정. workspaceId 가 null 이면 동아리 전체 일정, visibility 는 workspace·private·club. */
export interface Event {
  id: Id;
  workspaceId: Id | null;
  title: string;
  date: string;
  endDate: string;
  start: string;
  end: string;
  visibility: string;
  assigneeIds: string[];
  work: string;
  status: string;
  createdBy: string;
  updatedAt?: string;
  deleted?: boolean;
  owner?: string;
  public?: boolean;
  description?: string;
}
/** 동아리방 예약. 취소해도 지우지 않고 status 를 '취소'로 바꾼다. */
export interface Booking {
  id: Id;
  workspaceId: Id;
  date: string;
  start: string;
  end: string;
  ownerId: string;
  purpose?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
  cancelReason?: string;
  owner?: string;
}
/** 활동별 태그 그룹. 방을 분류하는 태그를 묶는다. */
export interface TagGroup {
  id: string;
  name: string;
  tags: { id: string; name: string; label?: string }[];
}
/** 회의록 이전 버전과 문서별 메타데이터(현재 버전, 마지막 저장자·시각, 이전 버전 목록). */
export interface Version {
  version: number;
  body: string;
  updatedBy: string;
  updatedAt: string;
}
export interface DocumentMeta {
  version: number;
  updatedBy: string;
  updatedAt: string;
  history: Version[];
}
/** 브라우저에 저장하는 전체 자료. revision 은 변경마다 1씩 올라 최신 여부 비교에 쓴다. */
export interface Model {
  schemaVersion: number;
  revision: number;
  workspaces: Workspace[];
  rooms: Room[];
  events: Event[];
  bookings: Booking[];
  tagGroups: Record<string, TagGroup[]>;
  documents: Record<string, string>;
  documentMeta: Record<string, DocumentMeta>;
  audit: { id: string; action: string; userId: string; at: string }[];
  tagOrders?: Record<string, string[]>;
}

/** localStorage 키: 전체 자료, 회의록 초안, 화면 설정. */
export const STORE = 'cert-is-wireframe-v1';
export const DRAFTS = 'cert-is-drafts-v2';
export const UI_STORE = 'cert-is-ui-v2';

/** 서울 기준 오늘 날짜(YYYY-MM-DD). */
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
/** 숫자·문자열 ID를 같은 값으로 비교한다. 둘 중 하나라도 없으면 false. */
export const same = (a: Id | null | undefined, b: Id | null | undefined) =>
  a != null && b != null && String(a) === String(b);
/** 사용자 ID 또는 이름으로 ID 찾기, ID로 표시 이름 찾기. */
export const uid = (value?: string) => users.find(u => u.id === value || u.name === value)?.id;
export const name = (id: string) => users.find(u => u.id === id)?.name || '알 수 없는 사용자';
/** 새 자료 ID('접두어-UUID')와 현재 시각(ISO 문자열). */
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const iso = () => new Date().toISOString();
/** 시각 문자열(HH:MM)과 분 단위 숫자 변환. 형식이 틀리면 NaN. */
export const minutes = (value: string) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
export const time = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
/** 예약 시작·종료 시각 선택지(09:00~24:00, 30분 단위). 종료 '24:00'은 1440분으로 계산한다. */
export const bookingStarts = Array.from({ length: 30 }, (_, i) => time(540 + i * 30));
export const bookingEnds = Array.from({ length: 30 }, (_, i) => time(570 + i * 30));
export const bookingEndMinutes = (value: string) => (value === '24:00' ? 1440 : minutes(value));
/** 날짜 문자열(YYYY-MM-DD)과 Date 변환. Date 는 그날 정오(로컬 시각)로 만든다. */
export const dateObj = (day: string) => new Date(`${day}T12:00:00`);
export const dateString = (day: Date) =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
/** 저장 시각을 서울 기준 월·일·시각 문구로 표시. 값이 없으면 '—'. */
export const stamp = (at?: string) =>
  at
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(at))
    : '—';
/** ID로 활동·방 찾기. */
export const workspace = (m: Model, wid?: Id | null) => m.workspaces.find(w => same(w.id, wid));
export const room = (m: Model, rid?: Id) => m.rooms.find(r => same(r.id, rid));

/** 활동 구성원·팀장 여부. */
export const member = (w: Workspace | undefined, user: string) => !!w?.memberIds.includes(user);
export const leader = (w: Workspace | undefined, user: string) => member(w, user) && w?.leaderId === user;
/** 활동 조회는 구성원 또는 임원진, 쓰기는 보관되지 않은 활동의 구성원만 가능. */
export const canView = (w: Workspace | undefined, s: Session) => !!w && (member(w, s.userId) || s.officer);
export const writable = (w: Workspace | undefined, s: Session) => !!w && member(w, s.userId) && w.status !== '보관';
/** 채팅 쓰기·읽기 권한. 보관되지 않은 방의 방·활동 구성원이어야 하며, 보관 활동에서는 읽기만 가능. */
export const canChat = (r: Room | undefined, w: Workspace | undefined, s: Session) =>
  !!r && !r.archived && writable(w, s) && r.memberIds.includes(s.userId);
export const canReadChat = (r: Room, w: Workspace | undefined, s: Session) =>
  !r.archived && member(w, s.userId) && r.memberIds.includes(s.userId);
/** 수정 권한. 예약은 예약자·팀장·임원진, 동아리 일정은 임원진, 활동 일정은 활동 쓰기 권한자. */
export const bookingEditable = (b: Booking, m: Model, s: Session) =>
  b.ownerId === s.userId || leader(workspace(m, b.workspaceId), s.userId) || s.officer;
export const eventEditable = (e: Event, m: Model, s: Session) =>
  e.visibility === 'club' ? s.officer : writable(workspace(m, e.workspaceId), s);
/** 활동에서의 내 역할 표시 문구. */
export const role = (w: Workspace, s: Session) =>
  leader(w, s.userId) ? '팀장' : member(w, s.userId) ? '팀원' : '미참여 · 조회';
/** 활동 페이지의 해시 주소. 방 ID가 있으면 ?room= 으로 붙인다. */
export const url = (w: Workspace, page = 'calendar', rid?: Id) =>
  `#/workspace/${w.id}/${page}${rid ? `?room=${rid}` : ''}`;

/** localStorage JSON 읽기(실패하면 기본값)와 쓰기(실패하면 오류). */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('브라우저 저장 공간을 사용할 수 없음. 변경 내용은 저장되지 않았음');
  }
}
/** 저장 자료를 검사해 현재 형식(schemaVersion 2)으로 맞춘다. 빠진 값은 샘플·기본값으로 채운다. */
export function normalize(raw: unknown): Model {
  // 이전 시제품의 필드도 읽어야 같은 저장 키를 사용하는 기존 자료를 이어 쓸 수 있다.
  if (!raw || typeof raw !== 'object') throw new Error('저장 자료 형식 오류');
  const m = structuredClone(raw) as Model;
  if (!Array.isArray(m.workspaces) || !Array.isArray(m.rooms) || !Array.isArray(m.bookings) || !m.documents)
    throw new Error('저장 자료 형식 오류');

  // 스키마 버전이 없는 이전 자료에는 샘플 활동·방 중 없는 것을 더한다.
  if (!m.schemaVersion) {
    for (const w of seed.workspaces)
      if (!m.workspaces.some(x => same(x.id, w.id))) m.workspaces.push(structuredClone(w) as Workspace);
    for (const r of seed.rooms) if (!m.rooms.some(x => same(x.id, r.id))) m.rooms.push(structuredClone(r) as Room);
  }
  m.schemaVersion = 2;
  m.revision ||= 0;
  m.audit ||= [];
  m.events ||= structuredClone(seed.events) as Event[];
  m.documentMeta ||= {};
  m.tagGroups ||= {};

  // 활동: 구성원·팀장·기간 기본값, 표시용 구성원 정보 갱신, 신청자 정리, 태그 그룹 채움
  for (const w of m.workspaces) {
    const example = seed.workspaces.find(x => same(x.id, w.id));
    w.memberIds ||= (w.memberNames || ['나']).map(uid).filter((x): x is string => !!x);
    w.leaderId ||= example?.leaderId || 'me';
    if (!w.memberIds.includes(w.leaderId)) w.leaderId = w.memberIds[0];
    w.createdBy ||= example?.createdBy || w.leaderId;
    w.goal ??= w.description || '';
    w.startDate ||= '';
    w.endDate ||= '';
    w.updatedAt ||= iso();
    w.members = w.memberIds.length;
    w.memberNames = w.memberIds.map(name);
    w.applicantIds = [...new Set((w.applicantIds || []).filter(x => !!uid(x) && !w.memberIds.includes(x)))];
    m.tagGroups[w.id] ||= structuredClone(seed.tagGroups[String(w.id) as keyof typeof seed.tagGroups] || []);
    for (const g of m.tagGroups[w.id]) for (const t of g.tags) t.name ??= t.label || '';
  }

  // 방: 활동 구성원만 남기고, 이전 week·topic 값은 같은 이름의 태그로 연결, 메시지·회의록 기본값 채움
  for (const r of m.rooms) {
    const w = workspace(m, r.workspaceId);
    r.memberIds ||= (r.members || []).map(uid).filter((x): x is string => !!x && member(w, x));
    r.memberIds = r.memberIds.filter(x => member(w, x));
    r.tagIds ||= (m.tagGroups[r.workspaceId] || []).flatMap(g =>
      g.tags.filter(t => t.name === r.week || t.name === r.topic).map(t => t.id)
    );
    r.createdAt ||= iso();
    r.messages = r.messages.map((msg, i) => ({
      ...msg,
      id: msg.id || `seed-${r.id}-${i}`,
      authorId: msg.authorId || uid(msg.name) || r.memberIds[0],
      createdAt: msg.createdAt || `2026-10-06T${msg.time || '09:00'}:00+09:00`
    }));
    m.documents[r.id] ??= `# ${r.name} 회의록\n`;
    m.documentMeta[r.id] ||= { version: 1, updatedBy: w?.leaderId || 'me', updatedAt: iso(), history: [] };
  }

  // 일정·예약: 이전 필드(owner·public·description)를 현재 필드로 옮기고 기본값 채움
  for (const e of m.events) {
    e.assigneeIds ||= [uid(e.owner)].filter((x): x is string => !!x);
    e.endDate ||= e.date;
    e.visibility ||= e.public ? 'club' : 'workspace';
    e.status ||= '예정';
    e.work ||= e.description || '';
    e.createdBy ||= e.assigneeIds[0] || 'me';
  }
  for (const b of m.bookings) {
    b.ownerId ||= uid(b.owner) || workspace(m, b.workspaceId)?.memberIds.find(x => x !== 'me') || 'me';
    b.status ||= '확정';
    b.createdAt ||= iso();
  }
  return m;
}
/** 샘플 자료(seed.json)로 새 모델을 만든다. */
export function fresh(): Model {
  return normalize(seed);
}

/** 저장 자료를 읽지 못했을 때의 경고 문구. 이때는 샘플을 보여 주고 일반 변경 저장을 막는다. */
export let loadWarning = '';
// 저장된 자료를 읽는다. 없으면 샘플, 읽기에 실패하면 경고를 남기고 샘플을 쓴다.
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    const next = raw ? normalize(JSON.parse(raw)) : fresh();
    loadWarning = '';
    return next;
  } catch {
    loadWarning = '기존 자료를 읽지 못해 샘플을 표시 중임. 기존 저장 공간은 초기화하지 않았음';
    return fresh();
  }
}

// 현재 자료 스냅샷과 변경 구독자. localStorage 가 없는 환경(브라우저 밖)에서는 샘플로 시작한다.
let snapshot = typeof localStorage === 'undefined' ? fresh() : load();
const listeners = new Set<() => void>();
/** useSyncExternalStore 에 넘기는 스냅샷 조회·구독 함수. */
export const getSnapshot = () => snapshot;
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
// 스냅샷을 바꾸고 구독자에게 알린다.
function publish(next: Model) {
  snapshot = next;
  listeners.forEach(fn => fn());
}
/** 저장소의 자료가 더 최신 revision 이면 다시 읽어 반영한다. */
export function refresh() {
  const next = load();
  if (next.revision > snapshot.revision) publish(next);
}
// 다른 탭에서 자료를 바꾸면 storage 이벤트로 받아 반영한다.
if (typeof window !== 'undefined')
  window.addEventListener('storage', e => {
    if (e.key === STORE) refresh();
  });

/**
 * 모든 자료 변경의 공통 경로. 최신 자료 복사본에 change 를 적용하고 revision 과
 * 변경 기록(audit)을 남긴 뒤 검사·저장하고 구독자에게 알린다. change 의 결과를 돌려준다.
 */
// ponytail: browser-local snapshots only; server transactions replace this adapter when the API exists.
export function mutate<T>(action: string, s: Session, change: (next: Model) => T): T {
  if (typeof localStorage !== 'undefined') refresh();
  // 읽기 실패 시 표시한 샘플로 원본을 덮어쓰지 않도록 일반 변경을 차단한다.
  if (loadWarning)
    throw new Error('기존 자료를 읽지 못해 변경을 저장할 수 없음. 원본을 복구하거나 명시적으로 샘플 초기화해야 함');
  // 복사본에 변경 적용, revision 증가, 변경 기록은 최근 200개만 유지
  const next = structuredClone(snapshot),
    result = change(next);
  next.revision = snapshot.revision + 1;
  next.audit.unshift({ id: id('change'), action, userId: s.userId, at: iso() });
  next.audit = next.audit.slice(0, 200);
  const checked = normalize(next);
  // 저장에 성공한 뒤 구독자에게 알려야 실패한 변경이 화면에 확정되지 않는다.
  writeLocal(STORE, checked);
  publish(checked);
  return result;
}
/** 저장 자료를 샘플로 초기화한다. 읽기 실패 경고도 함께 해제된다. */
export function resetModel() {
  const next = fresh();
  next.revision = snapshot.revision + 1;
  // 사용자가 확인한 초기화만 읽기 실패 상태의 원본을 교체할 수 있다.
  writeLocal(STORE, next);
  loadWarning = '';
  publish(next);
}

/** 권한 검사: 활동 쓰기 권한(보관 활동 제외)·팀장 권한이 없으면 오류를 던진다. */
export function requireMember(w: Workspace | undefined, s: Session): asserts w is Workspace {
  if (!writable(w, s)) throw new Error('활동 구성원만 변경 가능함. 보관 활동은 조회 전용임');
}
export function requireLeader(w: Workspace | undefined, s: Session): asserts w is Workspace {
  if (!leader(w, s.userId)) throw new Error('이 활동의 팀장만 변경 가능함');
}
/** 기간 검사: 마감일이 시작일보다 앞서면 오류. */
export function validatePeriod(start: string, end: string) {
  if (start && end && end < start) throw new Error('마감일은 시작일보다 빠를 수 없음');
}
/** 예약 검증. exclude 는 수정 중인 예약 자신의 ID로, 겹침 검사에서 뺀다. */
export function checkBooking(m: Model, b: Pick<Booking, 'workspaceId' | 'date' | 'start' | 'end'>, exclude?: Id) {
  if (!workspace(m, b.workspaceId)) throw new Error('활동을 선택해야 함');
  // 실제 있는 날짜이면서 오늘 이후인지
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
    Number.isNaN(dateObj(b.date).valueOf()) ||
    dateString(dateObj(b.date)) !== b.date ||
    b.date < today()
  )
    throw new Error('오늘 이후 날짜를 선택해야 함');
  // 시작·종료가 선택지 안에 있고 종료가 시작보다 늦은지
  const start = minutes(b.start),
    end = bookingEndMinutes(b.end);
  if (!bookingStarts.includes(b.start) || !bookingEnds.includes(b.end) || end <= start)
    throw new Error('09:00~24:00 안에서 30분 단위로 종료 시간을 지정해야 함');
  // 오늘 예약이면 현재 시각(서울)이 지난 시작 시각은 거부
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date());
  if (b.date === today() && start <= minutes(now)) throw new Error('이미 지난 시작 시각은 예약할 수 없음');
  // 활동과 관계없이 취소되지 않은 다른 예약과 시간이 겹치면 거부
  if (
    m.bookings.some(
      x =>
        !same(x.id, exclude) &&
        x.status !== '취소' &&
        x.date === b.date &&
        start < bookingEndMinutes(x.end) &&
        end > minutes(x.start)
    )
  )
    throw new Error('다른 예약과 시간이 겹침. 최신 현황에서 다른 시간을 선택하면 됨');
}
/** 회의록 저장. 이전 본문을 기록(최근 10개)에 남기고 버전을 올린다. */
export function saveDocument(rid: Id, body: string, baseVersion: number, s: Session) {
  return mutate('회의록 저장', s, m => {
    const r = room(m, rid);
    requireMember(workspace(m, r?.workspaceId), s);
    if (!r) throw new Error('회의록을 찾을 수 없음');
    const meta = m.documentMeta[rid];
    // 최신 저장본을 확인한 초안만 저장해 다른 사용자의 변경을 보존한다.
    if (meta.version !== baseVersion) throw new Error('다른 사용자가 먼저 저장했음. 최신본과 초안을 비교해야 함');
    meta.history.unshift({
      version: meta.version,
      body: m.documents[rid],
      updatedBy: meta.updatedBy,
      updatedAt: meta.updatedAt
    });
    meta.history = meta.history.slice(0, 10);
    m.documents[rid] = body;
    meta.version++;
    meta.updatedBy = s.userId;
    meta.updatedAt = iso();
  });
}
/** 활동 구성원·팀장 변경. 빠진 구성원은 그 활동의 방에서도 뺀다. */
export function updateMembers(m: Model, w: Workspace, ids: string[], newLeader: string) {
  if (!ids.includes(newLeader)) throw new Error('팀장은 구성원으로 포함되어야 함');
  if (ids.some(x => !uid(x))) throw new Error('알 수 없는 구성원');
  w.memberIds = ids;
  w.leaderId = newLeader;
  w.updatedAt = iso();
  for (const r of m.rooms.filter(r => same(r.workspaceId, w.id)))
    r.memberIds = r.memberIds.filter(x => ids.includes(x));
}

/**
 * 사용자에게 보이는 일정(삭제 제외, 비공개는 담당자만). 활동을 주면 그 활동 일정과 동아리 일정,
 * 없으면 동아리 일정과 내 활동 일정(임원진이 scope 'all'이면 모든 활동). mine 이면 내 담당만.
 */
export function visibleEvents(m: Model, s: Session, w?: Workspace, mine = false, scope = 'mine') {
  return m.events.filter(
    e =>
      !e.deleted &&
      (e.visibility !== 'private' || e.assigneeIds.includes(s.userId)) &&
      (w
        ? same(e.workspaceId, w.id) || e.visibility === 'club'
        : e.visibility === 'club' || member(workspace(m, e.workspaceId), s.userId) || (s.officer && scope === 'all')) &&
      (!mine || e.assigneeIds.includes(s.userId))
  );
}
/** 캘린더 표시 항목. 예약에서 만든 항목은 bookingId 를 가진다. */
export type CalendarEvent = Event & { bookingId?: Id };
/** 캘린더에 그릴 항목: 보이는 일정과 취소되지 않은 예약을 일정 형태로 바꾼 것. */
export function calendarEvents(m: Model, s: Session, w?: Workspace, mine = false, scope = 'mine'): CalendarEvent[] {
  // 예약을 별도 일정으로 저장하지 않아 변경·취소 시 두 자료가 어긋나지 않는다.
  const bookings = m.bookings.filter(
    b =>
      b.status !== '취소' &&
      (w
        ? same(b.workspaceId, w.id)
        : b.ownerId === s.userId || member(workspace(m, b.workspaceId), s.userId) || (s.officer && scope === 'all')) &&
      (!mine || b.ownerId === s.userId)
  );
  return [
    ...visibleEvents(m, s, w, mine, scope),
    ...bookings.map(b => ({
      id: `booking:${b.id}`,
      bookingId: b.id,
      workspaceId: b.workspaceId,
      title: `동아리방 예약 · ${workspace(m, b.workspaceId)?.name || '활동'}`,
      date: b.date,
      endDate: b.date,
      start: b.start,
      end: b.end,
      visibility: 'workspace',
      assigneeIds: [b.ownerId],
      work: b.purpose || '',
      status: b.status,
      createdBy: b.ownerId,
      updatedAt: b.updatedAt
    }))
  ];
}
/** 저장 전 회의록 초안. baseVersion 은 초안을 시작할 때의 회의록 버전. */
export interface Draft {
  body: string;
  baseVersion: number;
  at: string;
}
/** 홈 화면 마감 목록. 완료·보관이 아닌 활동의 종료일과 완료되지 않은 일정을 남은 일수와 함께 날짜순으로. */
export function dashboardDeadlines(m: Model, s: Session, day = today()) {
  const active = m.workspaces.filter(w => canView(w, s) && !['완료', '보관'].includes(w.status));
  return [
    // 활동 종료일
    ...active
      .filter(w => w.endDate)
      .map(w => ({
        key: `workspace-${w.id}`,
        workspaceId: w.id,
        eventId: undefined as Id | undefined,
        title: '활동 마감',
        activity: w.name,
        date: w.endDate
      })),
    // 완료되지 않은 일정(동아리 일정 또는 위 활동의 일정)의 종료일
    ...visibleEvents(m, s, undefined, false, s.officer ? 'all' : 'mine')
      .filter(e => e.status !== '완료' && (e.workspaceId === null || active.some(w => same(w.id, e.workspaceId))))
      .map(e => ({
        key: `event-${e.id}`,
        workspaceId: e.workspaceId,
        eventId: e.id,
        title: e.title,
        activity: workspace(m, e.workspaceId)?.name || '동아리 전체',
        date: e.endDate
      }))
  ]
    .map(item => ({
      ...item,
      days: Math.round((Date.parse(`${item.date}T00:00:00+09:00`) - Date.parse(`${day}T00:00:00+09:00`)) / 86400000)
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
}
/** 사용자·방별 회의록 초안 읽기와 저장. draft 없이 저장하면 초안을 지운다. */
export function getDraft(user: string, rid: Id): Draft | undefined {
  return readLocal<Record<string, Draft>>(DRAFTS, {})[`${user}:${rid}`];
}
export function setDraft(user: string, rid: Id, draft?: Draft) {
  const drafts = readLocal<Record<string, Draft>>(DRAFTS, {}),
    key = `${user}:${rid}`;
  if (draft) drafts[key] = draft;
  else delete drafts[key];
  writeLocal(DRAFTS, drafts);
}

/** 대화상자 종류. */
export type ModalKind =
  | 'workspace-info'
  | 'workspace-apply'
  | 'list-filters'
  | 'calendar-filters'
  | 'room-sort'
  | 'workspace-pick'
  | 'workspace-new'
  | 'workspace-edit'
  | 'members'
  | 'leave'
  | 'event'
  | 'event-delete'
  | 'booking'
  | 'booking-info'
  | 'booking-cancel'
  | 'room'
  | 'room-settings'
  | 'room-archive'
  | 'tags'
  | 'group-new'
  | 'group-rename'
  | 'tag-new'
  | 'tag-rename'
  | 'group-delete'
  | 'tag-delete'
  | 'document-pick'
  | 'document-history'
  | 'reset';
/** 열린 대화상자와 대상 정보. date·start 는 새 일정·예약의 기본값으로 쓴다. */
export interface ModalState {
  kind: ModalKind;
  id?: Id;
  workspaceId?: Id;
  groupId?: string;
  date?: string;
  start?: string;
}
/** 브라우저에 저장하는 화면 설정: 세션, 사이드바·채팅 상태, 목록·캘린더 필터, 설문 응답 등. */
export interface Preferences extends Session {
  collapsed: boolean;
  chatWidth: number;
  chatWorkspaceId: Id;
  chatRooms: Record<string, Id>;
  reads: Record<string, string>;
  messageDrafts: Record<string, string>;
  scope: string;
  lastHash: string;
  docMode: string;
  roomSort: string;
  roomSortGroup: string;
  calendarMode: string;
  calendarMine: boolean;
  calendarScope: string;
  calendarPins: Record<string, string[]>;
  aiSurveys: Record<string, SurveyAnswer[]>;
  listType: string;
  listField: string;
  listStatus: string;
  listOwner: string;
  listOrder: string;
}
/** 화면 설정 기본값. */
export const defaultPreferences: Preferences = {
  userId: 'me',
  officer: false,
  collapsed: false,
  chatWidth: 300,
  chatWorkspaceId: 1,
  chatRooms: {},
  reads: {},
  messageDrafts: {},
  scope: 'mine',
  lastHash: '#/dashboard',
  docMode: 'split',
  roomSort: 'recent',
  roomSortGroup: '',
  calendarMode: 'month',
  calendarMine: false,
  calendarScope: 'mine',
  calendarPins: {},
  aiSurveys: {},
  listType: 'all',
  listField: 'all',
  listStatus: 'active',
  listOwner: 'all',
  listOrder: 'recent'
};
/**
 * 저장된 화면 설정을 기본값과 합쳐 읽는다. 사용자 ID·채팅 너비(240~460)를 바로잡고,
 * 일정 즐겨찾기·설문 응답은 알 수 없는 사용자나 형식이 틀린 값을 걸러낸다.
 */
export function loadPreferences(): Preferences {
  const p = { ...defaultPreferences, ...readLocal<Partial<Preferences>>(UI_STORE, {}) };
  p.userId = uid(p.userId) || 'me';
  p.chatWidth = Math.min(460, Math.max(240, Number(p.chatWidth) || 300));
  p.calendarPins = Object.fromEntries(
    Object.entries(p.calendarPins && typeof p.calendarPins === 'object' ? p.calendarPins : {})
      .filter(([user, ids]) => !!uid(user) && Array.isArray(ids))
      .map(([user, ids]) => [
        user,
        [...new Set(ids.filter(id => typeof id === 'string' || typeof id === 'number').map(String))]
      ])
  );
  p.aiSurveys = Object.fromEntries(
    Object.entries(p.aiSurveys && typeof p.aiSurveys === 'object' ? p.aiSurveys : {}).filter(
      ([user, answers]) =>
        !!uid(user) &&
        Array.isArray(answers) &&
        answers.length <= surveyQuestions.length &&
        Array.from(answers).every(isSurveyAnswer)
    )
  );
  return p;
}

/**
 * 대화상자 폼 제출을 처리한다. 종류별로 권한·입력을 검사한 뒤 mutate 로 저장하며,
 * 새 활동을 만들면 그 ID를 돌려준다. 검사에 실패하면 안내 문구와 함께 오류를 던진다.
 */
export function applyForm(modal: ModalState, f: FormData, s: Session): Id | undefined {
  // 폼 값 읽기: 한 값(앞뒤 공백 제거), 같은 이름의 여러 값
  const get = (key: string) => String(f.get(key) || '').trim();
  const all = (key: string) => f.getAll(key).map(String);
  const kind = modal.kind,
    target = modal.id;
  // 변경 기록(audit)에 남길 작업 이름
  const label: Partial<Record<ModalKind, string>> = {
    'workspace-apply': '참가 신청',
    'workspace-new': '활동 생성',
    'workspace-edit': '활동 정보 변경',
    members: '구성원 및 팀장 변경',
    leave: '활동 탈퇴',
    event: '일정 변경',
    'event-delete': '일정 삭제',
    booking: '예약 확정 / 변경',
    'booking-cancel': '예약 취소',
    room: '방 생성 / 변경',
    'room-archive': '방 보관',
    'group-new': '태그 그룹 생성',
    'group-rename': '그룹 이름 변경',
    'tag-new': '태그 생성',
    'tag-rename': '태그 이름 변경',
    'group-delete': '그룹 삭제',
    'tag-delete': '태그 삭제'
  };
  return mutate(label[kind] || '관리 변경', s, m => {
    const w = workspace(m, modal.workspaceId || get('workspaceId'));
    switch (kind) {
      // 참가 신청: 종료되지 않은 활동에 미참여자만 신청자로 추가
      case 'workspace-apply':
        if (!uid(s.userId) || !w) throw new Error('사용자와 활동을 확인해야 함');
        if (['완료', '보관'].includes(w.status)) throw new Error('종료된 활동에는 신청할 수 없음');
        if (member(w, s.userId)) throw new Error('이미 참여 중인 활동임');
        if (w.applicantIds?.includes(s.userId)) throw new Error('이미 신청한 활동임');
        (w.applicantIds ||= []).push(s.userId);
        break;
      // 활동 생성: 만든 사람이 팀장이 되고, 기본 방 '일반'과 회의록·태그 그룹도 함께 만든다
      case 'workspace-new': {
        const title = get('name');
        if (!title) throw new Error('활동 이름을 입력해야 함');
        if (!fields.includes(get('field')) || !['project', 'study'].includes(get('type')))
          throw new Error('유형과 분야를 확인해야 함');
        validatePeriod(get('startDate'), get('endDate'));
        const wid = id('workspace'),
          rid = id('room'),
          ids = [...new Set([s.userId, ...all('members')])];
        if (ids.some(x => !uid(x))) throw new Error('알 수 없는 구성원');
        m.workspaces.push({
          id: wid,
          name: title,
          type: get('type') as Workspace['type'],
          initial: title.slice(0, 2).toUpperCase(),
          field: get('field'),
          goal: get('goal'),
          startDate: get('startDate'),
          endDate: get('endDate'),
          status: '계획',
          memberIds: ids,
          leaderId: s.userId,
          createdBy: s.userId,
          updatedAt: iso()
        });
        m.rooms.push({
          id: rid,
          workspaceId: wid,
          name: '일반',
          memberIds: ids,
          tagIds: [],
          messages: [],
          createdBy: s.userId,
          createdAt: iso()
        });
        m.documents[rid] = '# 회의록\n';
        m.documentMeta[rid] = { version: 1, updatedBy: s.userId, updatedAt: iso(), history: [] };
        m.tagGroups[wid] = [];
        return wid;
      }
      // 활동 정보 변경, 구성원·팀장 변경(팀장 전용)
      case 'workspace-edit':
        requireLeader(w, s);
        if (!get('name')) throw new Error('이름이 공백임');
        if (!fields.includes(get('field')) || !statuses.includes(get('status')))
          throw new Error('분야와 상태를 확인해야 함');
        validatePeriod(get('startDate'), get('endDate'));
        Object.assign(w, {
          name: get('name'),
          field: get('field'),
          goal: get('goal'),
          startDate: get('startDate'),
          endDate: get('endDate'),
          status: get('status'),
          updatedAt: iso()
        });
        break;
      case 'members':
        requireLeader(w, s);
        updateMembers(m, w, all('members'), get('leader'));
        break;
      // 활동 탈퇴: 팀장은 먼저 다른 구성원에게 위임해야 함
      case 'leave':
        requireMember(w, s);
        if (leader(w, s.userId)) throw new Error('팀장은 먼저 다른 구성원에게 위임해야 함');
        updateMembers(
          m,
          w,
          w.memberIds.filter(x => x !== s.userId),
          w.leaderId
        );
        break;
      // 일정 등록·수정: 수정 권한, 공개 범위(동아리 일정은 임원진), 날짜·시각, 담당자, 상태 검사
      case 'event': {
        const previous = m.events.find(e => same(e.id, target)),
          wid = get('workspaceId'),
          club = wid === 'club';
        if (previous && !eventEditable(previous, m, s)) throw new Error('기존 일정 변경 권한 없음');
        const chosen = workspace(m, wid);
        if (club) {
          if (!s.officer) throw new Error('동아리 일정은 임원진만 등록 가능함');
        } else requireMember(chosen, s);
        const visibility = club ? 'club' : get('visibility'),
          assignees = all('assignees');
        if (!['workspace', 'private', 'club'].includes(visibility) || (visibility === 'club' && !s.officer))
          throw new Error('공개 범위 권한 없음');
        if (!get('title')) throw new Error('제목을 입력해야 함');
        for (const key of ['date', 'endDate'])
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(get(key)) ||
            Number.isNaN(dateObj(get(key)).valueOf()) ||
            dateString(dateObj(get(key))) !== get(key)
          )
            throw new Error('날짜를 확인해야 함');
        validatePeriod(get('date'), get('endDate'));
        const start = minutes(get('start')),
          end = minutes(get('end'));
        if (
          !Number.isFinite(start + end) ||
          start >= 1440 ||
          end >= 1440 ||
          (get('date') === get('endDate') && end <= start)
        )
          throw new Error('시작/종료 시각을 확인해야 함');
        if (!assignees.length || assignees.some(x => !uid(x) || (!club && !chosen?.memberIds.includes(x))))
          throw new Error('활동 구성원 중 담당자를 지정해야 함');
        if (!['예정', '진행 중', '완료', '보류'].includes(get('status'))) throw new Error('진행 상태를 확인해야 함');
        const e: Event = {
          id: previous?.id || id('event'),
          workspaceId: club ? null : chosen!.id,
          title: get('title'),
          date: get('date'),
          endDate: get('endDate'),
          start: get('start'),
          end: get('end'),
          assigneeIds: assignees,
          work: get('work'),
          visibility,
          status: get('status'),
          createdBy: previous?.createdBy || s.userId,
          updatedAt: iso()
        };
        if (previous) Object.assign(previous, e);
        else m.events.push(e);
        break;
      }
      // 일정 삭제: 자료는 남기고 deleted 표시만 한다
      case 'event-delete': {
        const e = m.events.find(e => same(e.id, target));
        if (!e || !eventEditable(e, m, s)) throw new Error('일정 삭제 권한 없음');
        e.deleted = true;
        break;
      }
      // 예약 확정·변경: 활동 쓰기 권한(또는 임원진) 확인 후 checkBooking 으로 시간 검사
      case 'booking': {
        const previous = m.bookings.find(b => same(b.id, target)),
          chosen = workspace(m, get('workspaceId'));
        if (previous && !bookingEditable(previous, m, s)) throw new Error('예약 변경 권한 없음');
        if (!chosen || !(writable(chosen, s) || (s.officer && chosen.status !== '보관')))
          throw new Error('예약 가능한 활동을 선택해야 함');
        if (!get('purpose')) throw new Error('사용 목적을 입력해야 함');
        if (previous?.status === '취소') throw new Error('이미 취소된 예약임');
        const b: Booking = {
          id: previous?.id || id('booking'),
          workspaceId: chosen.id,
          date: get('date'),
          start: get('start'),
          end: get('end'),
          purpose: get('purpose'),
          ownerId: previous?.ownerId || s.userId,
          status: '확정',
          createdAt: previous?.createdAt || iso(),
          updatedAt: iso(),
          updatedBy: s.userId
        };
        checkBooking(m, b, target);
        if (previous) Object.assign(previous, b);
        else m.bookings.push(b);
        break;
      }
      // 예약 취소: 사유를 남기고 상태만 '취소'로 바꾼다
      case 'booking-cancel': {
        const b = m.bookings.find(b => same(b.id, target));
        if (!b || !bookingEditable(b, m, s)) throw new Error('예약 취소 권한 없음');
        if (!get('reason')) throw new Error('취소 사유를 입력해야 함');
        Object.assign(b, { status: '취소', cancelReason: get('reason'), updatedBy: s.userId, updatedAt: iso() });
        break;
      }
      // 방 생성·변경: 구성원·태그 검사, 새 방이면 회의록도 만든다
      case 'room': {
        requireMember(w, s);
        const ids = all('members'),
          tags = all('tags');
        if (!get('name')) throw new Error('방 이름을 입력해야 함');
        if (!ids.length || ids.some(x => !w.memberIds.includes(x)))
          throw new Error('활동 구성원을 한 명 이상 지정해야 함');
        if (tags.some(x => !(m.tagGroups[w.id] || []).flatMap(g => g.tags).some(t => t.id === x)))
          throw new Error('사용 가능한 태그를 선택해야 함');
        let r = m.rooms.find(r => same(r.id, target));
        if (r && !same(r.workspaceId, w.id)) throw new Error('다른 활동의 방임');
        if (!r) {
          r = {
            id: id('room'),
            workspaceId: w.id,
            name: get('name'),
            memberIds: ids,
            tagIds: tags,
            messages: [],
            createdBy: s.userId,
            createdAt: iso()
          };
          m.rooms.push(r);
          m.documents[r.id] = '# 회의록\n';
          m.documentMeta[r.id] = { version: 1, updatedBy: s.userId, updatedAt: iso(), history: [] };
        } else Object.assign(r, { name: get('name'), memberIds: ids, tagIds: tags });
        break;
      }
      // 방 보관
      case 'room-archive': {
        const r = room(m, target);
        requireMember(workspace(m, r?.workspaceId), s);
        if (r) r.archived = true;
        break;
      }
      // 태그 그룹·태그 생성과 이름 변경. 생성할 때는 같은 이름을 막는다
      case 'group-new':
      case 'group-rename':
      case 'tag-new':
      case 'tag-rename': {
        requireMember(w, s);
        const groups = m.tagGroups[w.id] || (m.tagGroups[w.id] = []),
          g = groups.find(g => g.id === modal.groupId),
          title = get('name');
        if (!title) throw new Error('이름이 공백임');
        if (kind === 'group-new') {
          if (groups.some(g => g.name === title)) throw new Error('같은 그룹 이름 있음');
          groups.push({ id: id('group'), name: title, tags: [] });
        } else if (kind === 'group-rename') {
          const found = groups.find(g => same(g.id, target));
          if (!found) throw new Error('그룹을 찾을 수 없음');
          found.name = title;
        } else {
          if (!g) throw new Error('그룹을 찾을 수 없음');
          if (kind === 'tag-new') {
            if (g.tags.some(t => t.name === title)) throw new Error('같은 태그 이름 있음');
            g.tags.push({ id: id('tag'), name: title });
          } else {
            const t = g.tags.find(t => same(t.id, target));
            if (!t) throw new Error('태그를 찾을 수 없음');
            t.name = title;
          }
        }
        break;
      }
      // 태그 그룹·태그 삭제. 방에 붙어 있던 해당 태그도 뗀다
      case 'group-delete':
      case 'tag-delete': {
        requireMember(w, s);
        const groups = m.tagGroups[w.id],
          g = groups.find(g => same(g.id, kind === 'group-delete' ? target : modal.groupId));
        if (!g) throw new Error('그룹을 찾을 수 없음');
        const ids = kind === 'group-delete' ? g.tags.map(t => t.id) : [String(target)];
        if (kind === 'group-delete') m.tagGroups[w.id] = groups.filter(x => x !== g);
        else g.tags = g.tags.filter(t => !ids.includes(t.id));
        for (const r of m.rooms.filter(r => same(r.workspaceId, w.id)))
          r.tagIds = r.tagIds.filter(t => !ids.includes(t));
        break;
      }
      default:
        throw new Error('지원하지 않는 변경');
    }
  });
}
