import seed from './seed.json' with { type: 'json' };
import { isSurveyAnswer, surveyQuestions } from './recommend.ts';
import type { SurveyAnswer } from './recommend';

export type Id = string | number;
export type Session = { userId: string; officer: boolean };
export const fields = ['웹 보안', '네트워크', '암호학', '시스템 보안'];
export const statuses = ['계획', '진행 중', '보류', '완료', '보관'];
export const users = [{ id: 'me', name: '나' }, { id: 'gitae', name: '기태' }, { id: 'minseo', name: '민서' }, { id: 'hyelim', name: '혜림' }, { id: 'jisu', name: '지수' }, { id: 'doyun', name: '도윤' }, { id: 'subin', name: '수빈' }];
export interface Workspace {
  id: Id; name: string; type: 'project' | 'study'; initial: string; field: string;
  status: string; memberIds: string[]; leaderId: string; createdBy: string;
  goal: string; startDate: string; endDate: string; updatedAt: string;
  // ponytail: local demo requests; use an authenticated API when server participation is connected.
  applicantIds?: string[];
  memberNames?: string[]; description?: string; members?: number;
}
export interface Message { id: string; authorId: string; createdAt: string; text: string; name?: string; time?: string }
export interface Room {
  id: Id; workspaceId: Id; name: string; memberIds: string[]; tagIds: string[];
  messages: Message[]; createdAt: string; createdBy?: string; archived?: boolean;
  members?: string[]; week?: string; topic?: string;
}
export interface Event {
  id: Id; workspaceId: Id | null; title: string; date: string; endDate: string;
  start: string; end: string; visibility: string; assigneeIds: string[];
  work: string; status: string; createdBy: string; updatedAt?: string; deleted?: boolean;
  owner?: string; public?: boolean; description?: string;
}
export interface Booking {
  id: Id; workspaceId: Id; date: string; start: string; end: string; ownerId: string;
  purpose?: string; status: string; createdAt: string; updatedAt?: string;
  updatedBy?: string; cancelReason?: string; owner?: string;
}
export interface TagGroup { id: string; name: string; tags: { id: string; name: string; label?: string }[] }
export interface Version { version: number; body: string; updatedBy: string; updatedAt: string }
export interface DocumentMeta { version: number; updatedBy: string; updatedAt: string; history: Version[] }
export interface Model {
  schemaVersion: number; revision: number; workspaces: Workspace[]; rooms: Room[];
  events: Event[]; bookings: Booking[]; tagGroups: Record<string, TagGroup[]>;
  documents: Record<string, string>; documentMeta: Record<string, DocumentMeta>;
  audit: { id: string; action: string; userId: string; at: string }[];
  tagOrders?: Record<string, string[]>;
}
export const STORE = 'cert-is-wireframe-v1';
export const DRAFTS = 'cert-is-drafts-v2';
export const UI_STORE = 'cert-is-ui-v2';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const same = (a: Id | null | undefined, b: Id | null | undefined) => a != null && b != null && String(a) === String(b);
export const uid = (value?: string) => users.find(u => u.id === value || u.name === value)?.id;
export const name = (id: string) => users.find(u => u.id === id)?.name || '알 수 없는 사용자';
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const iso = () => new Date().toISOString();
export const minutes = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
export const time = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const bookingStarts = Array.from({ length: 30 }, (_, i) => time(540 + i * 30));
export const bookingEnds = Array.from({ length: 30 }, (_, i) => time(570 + i * 30));
export const bookingEndMinutes = (value: string) => value === '24:00' ? 1440 : minutes(value);
export const dateObj = (day: string) => new Date(`${day}T12:00:00`);
export const dateString = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
export const stamp = (at?: string) => at ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(at)) : '—';
export const workspace = (m: Model, wid?: Id | null) => m.workspaces.find(w => same(w.id, wid));
export const room = (m: Model, rid?: Id) => m.rooms.find(r => same(r.id, rid));
export const member = (w: Workspace | undefined, user: string) => !!w?.memberIds.includes(user);
export const leader = (w: Workspace | undefined, user: string) => member(w, user) && w?.leaderId === user;
export const canView = (w: Workspace | undefined, s: Session) => !!w && (member(w, s.userId) || s.officer);
export const writable = (w: Workspace | undefined, s: Session) => !!w && member(w, s.userId) && w.status !== '보관';
export const canChat = (r: Room | undefined, w: Workspace | undefined, s: Session) => !!r && !r.archived && writable(w, s) && r.memberIds.includes(s.userId);
export const canReadChat = (r: Room, w: Workspace | undefined, s: Session) => !r.archived && member(w, s.userId) && r.memberIds.includes(s.userId);
export const bookingEditable = (b: Booking, m: Model, s: Session) => b.ownerId === s.userId || leader(workspace(m, b.workspaceId), s.userId) || s.officer;
export const eventEditable = (e: Event, m: Model, s: Session) => e.visibility === 'club' ? s.officer : writable(workspace(m, e.workspaceId), s);
export const role = (w: Workspace, s: Session) => leader(w, s.userId) ? '팀장' : member(w, s.userId) ? '팀원' : '미참여 · 조회';
export const url = (w: Workspace, page = 'calendar', rid?: Id) => `#/workspace/${w.id}/${page}${rid ? `?room=${rid}` : ''}`;
export function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error('브라우저 저장 공간을 사용할 수 없음. 변경 내용은 저장되지 않았음'); }
}
export function normalize(raw: unknown): Model {
  if (!raw || typeof raw !== 'object') throw new Error('저장 자료 형식 오류');
  const m = structuredClone(raw) as Model;
  if (!Array.isArray(m.workspaces) || !Array.isArray(m.rooms) || !Array.isArray(m.bookings) || !m.documents) throw new Error('저장 자료 형식 오류');
  if (!m.schemaVersion) {
    for (const w of seed.workspaces) if (!m.workspaces.some(x => same(x.id, w.id))) m.workspaces.push(structuredClone(w) as Workspace);
    for (const r of seed.rooms) if (!m.rooms.some(x => same(x.id, r.id))) m.rooms.push(structuredClone(r) as Room);
  }
  m.schemaVersion = 2; m.revision ||= 0; m.audit ||= [];
  m.events ||= structuredClone(seed.events) as Event[]; m.documentMeta ||= {}; m.tagGroups ||= {};
  for (const w of m.workspaces) {
    const example = seed.workspaces.find(x => same(x.id, w.id));
    w.memberIds ||= (w.memberNames || ['나']).map(uid).filter((x): x is string => !!x);
    w.leaderId ||= example?.leaderId || 'me';
    if (!w.memberIds.includes(w.leaderId)) w.leaderId = w.memberIds[0];
    w.createdBy ||= example?.createdBy || w.leaderId;
    w.goal ??= w.description || ''; w.startDate ||= ''; w.endDate ||= ''; w.updatedAt ||= iso();
    w.members = w.memberIds.length; w.memberNames = w.memberIds.map(name);
    w.applicantIds = [...new Set((w.applicantIds || []).filter(x => !!uid(x) && !w.memberIds.includes(x)))];
    m.tagGroups[w.id] ||= structuredClone(seed.tagGroups[String(w.id) as keyof typeof seed.tagGroups] || []);
    for (const g of m.tagGroups[w.id]) for (const t of g.tags) t.name ??= t.label || '';
  }
  for (const r of m.rooms) {
    const w = workspace(m, r.workspaceId);
    r.memberIds ||= (r.members || []).map(uid).filter((x): x is string => !!x && member(w, x));
    r.memberIds = r.memberIds.filter(x => member(w, x));
    r.tagIds ||= (m.tagGroups[r.workspaceId] || []).flatMap(g => g.tags.filter(t => t.name === r.week || t.name === r.topic).map(t => t.id));
    r.createdAt ||= iso();
    r.messages = r.messages.map((msg, i) => ({ ...msg, id: msg.id || `seed-${r.id}-${i}`, authorId: msg.authorId || uid(msg.name) || r.memberIds[0], createdAt: msg.createdAt || `2026-10-06T${msg.time || '09:00'}:00+09:00` }));
    m.documents[r.id] ??= `# ${r.name} 회의록\n`;
    m.documentMeta[r.id] ||= { version: 1, updatedBy: w?.leaderId || 'me', updatedAt: iso(), history: [] };
  }
  for (const e of m.events) {
    e.assigneeIds ||= [uid(e.owner)].filter((x): x is string => !!x);
    e.endDate ||= e.date; e.visibility ||= e.public ? 'club' : 'workspace'; e.status ||= '예정'; e.work ||= e.description || ''; e.createdBy ||= e.assigneeIds[0] || 'me';
  }
  for (const b of m.bookings) {
    b.ownerId ||= uid(b.owner) || workspace(m, b.workspaceId)?.memberIds.find(x => x !== 'me') || 'me';
    b.status ||= '확정'; b.createdAt ||= iso();
  }
  return m;
}
export function fresh(): Model { return normalize(seed); }
export let loadWarning = '';
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? normalize(JSON.parse(raw)) : fresh();
  } catch { loadWarning = '기존 자료를 읽지 못해 샘플을 표시 중임. 기존 저장 공간은 초기화하지 않았음'; return fresh(); }
}
let snapshot = typeof localStorage === 'undefined' ? fresh() : load();
const listeners = new Set<() => void>();
export const getSnapshot = () => snapshot;
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: Model) { snapshot = next; listeners.forEach(fn => fn()); }
export function refresh() {
  const next = load(); if (next.revision > snapshot.revision) publish(next);
}
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === STORE) refresh(); });
// ponytail: browser-local snapshots only; server transactions replace this adapter when the API exists.
export function mutate<T>(action: string, s: Session, change: (next: Model) => T): T {
  if (typeof localStorage !== 'undefined') refresh();
  const next = structuredClone(snapshot), result = change(next);
  next.revision = snapshot.revision + 1;
  next.audit.unshift({ id: id('change'), action, userId: s.userId, at: iso() }); next.audit = next.audit.slice(0, 200);
  const checked = normalize(next); writeLocal(STORE, checked); publish(checked); return result;
}
export function resetModel() { const next = fresh(); next.revision = snapshot.revision + 1; writeLocal(STORE, next); publish(next); }
export function requireMember(w: Workspace | undefined, s: Session): asserts w is Workspace {
  if (!writable(w, s)) throw new Error('활동 구성원만 변경 가능함. 보관 활동은 조회 전용임');
}
export function requireLeader(w: Workspace | undefined, s: Session): asserts w is Workspace {
  if (!leader(w, s.userId)) throw new Error('이 활동의 팀장만 변경 가능함');
}
export function validatePeriod(start: string, end: string) {
  if (start && end && end < start) throw new Error('마감일은 시작일보다 빠를 수 없음');
}
export function checkBooking(m: Model, b: Pick<Booking, 'workspaceId' | 'date' | 'start' | 'end'>, exclude?: Id) {
  if (!workspace(m, b.workspaceId)) throw new Error('활동을 선택해야 함');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(dateObj(b.date).valueOf()) || dateString(dateObj(b.date)) !== b.date || b.date < today()) throw new Error('오늘 이후 날짜를 선택해야 함');
  const start = minutes(b.start), end = bookingEndMinutes(b.end);
  if (!bookingStarts.includes(b.start) || !bookingEnds.includes(b.end) || end <= start) throw new Error('09:00~24:00 안에서 30분 단위로 종료 시간을 지정해야 함');
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (b.date === today() && start <= minutes(now)) throw new Error('이미 지난 시작 시각은 예약할 수 없음');
  if (m.bookings.some(x => !same(x.id, exclude) && x.status !== '취소' && x.date === b.date && start < bookingEndMinutes(x.end) && end > minutes(x.start))) throw new Error('다른 예약과 시간이 겹침. 최신 현황에서 다른 시간을 선택하면 됨');
}
export function saveDocument(rid: Id, body: string, baseVersion: number, s: Session) {
  return mutate('회의록 저장', s, m => {
    const r = room(m, rid); requireMember(workspace(m, r?.workspaceId), s);
    if (!r) throw new Error('회의록을 찾을 수 없음');
    const meta = m.documentMeta[rid];
    if (meta.version !== baseVersion) throw new Error('다른 사용자가 먼저 저장했음. 최신본과 초안을 비교해야 함');
    meta.history.unshift({ version: meta.version, body: m.documents[rid], updatedBy: meta.updatedBy, updatedAt: meta.updatedAt }); meta.history = meta.history.slice(0, 10);
    m.documents[rid] = body; meta.version++; meta.updatedBy = s.userId; meta.updatedAt = iso();
  });
}
export function updateMembers(m: Model, w: Workspace, ids: string[], newLeader: string) {
  if (!ids.includes(newLeader)) throw new Error('팀장은 구성원으로 포함되어야 함');
  if (ids.some(x => !uid(x))) throw new Error('알 수 없는 구성원');
  w.memberIds = ids; w.leaderId = newLeader; w.updatedAt = iso();
  for (const r of m.rooms.filter(r => same(r.workspaceId, w.id))) r.memberIds = r.memberIds.filter(x => ids.includes(x));
}
export function visibleEvents(m: Model, s: Session, w?: Workspace, mine = false, scope = 'mine') {
  return m.events.filter(e => !e.deleted && (e.visibility !== 'private' || e.assigneeIds.includes(s.userId)) && (w ? same(e.workspaceId, w.id) || e.visibility === 'club' : e.visibility === 'club' || member(workspace(m, e.workspaceId), s.userId) || s.officer && scope === 'all') && (!mine || e.assigneeIds.includes(s.userId)));
}
export type CalendarEvent = Event & { bookingId?: Id };
export function calendarEvents(m: Model, s: Session, w?: Workspace, mine = false, scope = 'mine'): CalendarEvent[] {
  const bookings = m.bookings.filter(b => b.status !== '취소' && (w ? same(b.workspaceId, w.id) : b.ownerId === s.userId || member(workspace(m, b.workspaceId), s.userId) || s.officer && scope === 'all') && (!mine || b.ownerId === s.userId));
  return [...visibleEvents(m, s, w, mine, scope), ...bookings.map(b => ({
    id: `booking:${b.id}`, bookingId: b.id, workspaceId: b.workspaceId,
    title: `동아리방 예약 · ${workspace(m, b.workspaceId)?.name || '활동'}`,
    date: b.date, endDate: b.date, start: b.start, end: b.end,
    visibility: 'workspace', assigneeIds: [b.ownerId], work: b.purpose || '',
    status: b.status, createdBy: b.ownerId, updatedAt: b.updatedAt
  }))];
}
export interface Draft { body: string; baseVersion: number; at: string }
export function dashboardDeadlines(m: Model, s: Session, day = today()) {
  const active = m.workspaces.filter(w => canView(w, s) && !['완료', '보관'].includes(w.status));
  return [
    ...active.filter(w => w.endDate).map(w => ({ key: `workspace-${w.id}`, workspaceId: w.id, eventId: undefined as Id | undefined, title: '활동 마감', activity: w.name, date: w.endDate })),
    ...visibleEvents(m, s, undefined, false, s.officer ? 'all' : 'mine').filter(e => e.status !== '완료' && (e.workspaceId === null || active.some(w => same(w.id, e.workspaceId)))).map(e => ({ key: `event-${e.id}`, workspaceId: e.workspaceId, eventId: e.id, title: e.title, activity: workspace(m, e.workspaceId)?.name || '동아리 전체', date: e.endDate }))
  ].map(item => ({ ...item, days: Math.round((Date.parse(`${item.date}T00:00:00+09:00`) - Date.parse(`${day}T00:00:00+09:00`)) / 86400000) })).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
}
export function getDraft(user: string, rid: Id): Draft | undefined { return readLocal<Record<string, Draft>>(DRAFTS, {})[`${user}:${rid}`]; }
export function setDraft(user: string, rid: Id, draft?: Draft) {
  const drafts = readLocal<Record<string, Draft>>(DRAFTS, {}), key = `${user}:${rid}`;
  if (draft) drafts[key] = draft; else delete drafts[key]; writeLocal(DRAFTS, drafts);
}
export type ModalKind = 'workspace-info' | 'workspace-apply' | 'profile' | 'list-filters' | 'calendar-filters' | 'room-sort' | 'workspace-pick' | 'workspace-new' | 'workspace-edit' | 'members' | 'leave' | 'event' | 'event-delete' | 'booking' | 'booking-info' | 'booking-cancel' | 'room' | 'room-settings' | 'room-archive' | 'tags' | 'group-new' | 'group-rename' | 'tag-new' | 'tag-rename' | 'group-delete' | 'tag-delete' | 'document-pick' | 'document-history' | 'reset';
export interface ModalState { kind: ModalKind; id?: Id; workspaceId?: Id; groupId?: string; date?: string; start?: string }
export interface Preferences extends Session {
  collapsed: boolean; chatWidth: number; chatWorkspaceId: Id; chatRooms: Record<string, Id>;
  reads: Record<string, string>; messageDrafts: Record<string, string>; scope: string;
  lastHash: string; docMode: string; roomSort: string; roomSortGroup: string;
  calendarMode: string; calendarMine: boolean; calendarScope: string; calendarPins: Record<string, string[]>;
  aiSurveys: Record<string, SurveyAnswer[]>;
  listType: string; listField: string; listStatus: string; listOwner: string; listOrder: string;
}
export const defaultPreferences: Preferences = {
  userId: 'me', officer: false, collapsed: false, chatWidth: 300, chatWorkspaceId: 1,
  chatRooms: {}, reads: {}, messageDrafts: {}, scope: 'mine', lastHash: '#/dashboard', docMode: 'split',
  roomSort: 'recent', roomSortGroup: '', calendarMode: 'month', calendarMine: false, calendarScope: 'mine', calendarPins: {},
  aiSurveys: {}, listType: 'all', listField: 'all', listStatus: 'active', listOwner: 'all', listOrder: 'recent'
};
export function loadPreferences(): Preferences {
  const p = { ...defaultPreferences, ...readLocal<Partial<Preferences>>(UI_STORE, {}) };
  p.userId = uid(p.userId) || 'me'; p.chatWidth = Math.min(460, Math.max(240, Number(p.chatWidth) || 300));
  p.calendarPins = Object.fromEntries(Object.entries(p.calendarPins && typeof p.calendarPins === 'object' ? p.calendarPins : {}).filter(([user, ids]) => !!uid(user) && Array.isArray(ids)).map(([user, ids]) => [user, [...new Set(ids.filter(id => typeof id === 'string' || typeof id === 'number').map(String))]]));
  p.aiSurveys = Object.fromEntries(Object.entries(p.aiSurveys && typeof p.aiSurveys === 'object' ? p.aiSurveys : {}).filter(([user, answers]) => !!uid(user) && Array.isArray(answers) && answers.length <= surveyQuestions.length && Array.from(answers).every(isSurveyAnswer)));
  return p;
}
export function applyForm(modal: ModalState, f: FormData, s: Session): Id | undefined {
  const get = (key: string) => String(f.get(key) || '').trim();
  const all = (key: string) => f.getAll(key).map(String);
  const kind = modal.kind, target = modal.id;
  const label: Partial<Record<ModalKind, string>> = { 'workspace-apply': '참가 신청', 'workspace-new': '활동 생성', 'workspace-edit': '활동 정보 변경', members: '구성원 및 팀장 변경', leave: '활동 탈퇴', event: '일정 변경', 'event-delete': '일정 삭제', booking: '예약 확정 / 변경', 'booking-cancel': '예약 취소', room: '방 생성 / 변경', 'room-archive': '방 보관', 'group-new': '태그 그룹 생성', 'group-rename': '그룹 이름 변경', 'tag-new': '태그 생성', 'tag-rename': '태그 이름 변경', 'group-delete': '그룹 삭제', 'tag-delete': '태그 삭제' };
  return mutate(label[kind] || '관리 변경', s, m => {
    const w = workspace(m, modal.workspaceId || get('workspaceId'));
    switch (kind) {
      case 'workspace-apply':
        if (!uid(s.userId) || !w) throw new Error('사용자와 활동을 확인해야 함');
        if (['완료', '보관'].includes(w.status)) throw new Error('종료된 활동에는 신청할 수 없음');
        if (member(w, s.userId)) throw new Error('이미 참여 중인 활동임');
        if (w.applicantIds?.includes(s.userId)) throw new Error('이미 신청한 활동임');
        (w.applicantIds ||= []).push(s.userId); break;
      case 'workspace-new': {
        const title = get('name'); if (!title) throw new Error('활동 이름을 입력해야 함');
        if (!fields.includes(get('field')) || !['project', 'study'].includes(get('type'))) throw new Error('유형과 분야를 확인해야 함');
        validatePeriod(get('startDate'), get('endDate'));
        const wid = id('workspace'), rid = id('room'), ids = [...new Set([s.userId, ...all('members')])];
        if (ids.some(x => !uid(x))) throw new Error('알 수 없는 구성원');
        m.workspaces.push({ id: wid, name: title, type: get('type') as Workspace['type'], initial: title.slice(0, 2).toUpperCase(), field: get('field'), goal: get('goal'), startDate: get('startDate'), endDate: get('endDate'), status: '계획', memberIds: ids, leaderId: s.userId, createdBy: s.userId, updatedAt: iso() });
        m.rooms.push({ id: rid, workspaceId: wid, name: '일반', memberIds: ids, tagIds: [], messages: [], createdBy: s.userId, createdAt: iso() });
        m.documents[rid] = '# 회의록\n'; m.documentMeta[rid] = { version: 1, updatedBy: s.userId, updatedAt: iso(), history: [] }; m.tagGroups[wid] = [];
        return wid;
      }
      case 'workspace-edit':
        requireLeader(w, s); if (!get('name')) throw new Error('이름이 공백임');
        if (!fields.includes(get('field')) || !statuses.includes(get('status'))) throw new Error('분야와 상태를 확인해야 함');
        validatePeriod(get('startDate'), get('endDate'));
        Object.assign(w, { name: get('name'), field: get('field'), goal: get('goal'), startDate: get('startDate'), endDate: get('endDate'), status: get('status'), updatedAt: iso() }); break;
      case 'members': requireLeader(w, s); updateMembers(m, w, all('members'), get('leader')); break;
      case 'leave':
        requireMember(w, s); if (leader(w, s.userId)) throw new Error('팀장은 먼저 다른 구성원에게 위임해야 함');
        updateMembers(m, w, w.memberIds.filter(x => x !== s.userId), w.leaderId); break;
      case 'event': {
        const previous = m.events.find(e => same(e.id, target)), wid = get('workspaceId'), club = wid === 'club';
        if (previous && !eventEditable(previous, m, s)) throw new Error('기존 일정 변경 권한 없음');
        const chosen = workspace(m, wid);
        if (club) { if (!s.officer) throw new Error('동아리 일정은 임원진만 등록 가능함'); } else requireMember(chosen, s);
        const visibility = club ? 'club' : get('visibility'), assignees = all('assignees');
        if (!['workspace', 'private', 'club'].includes(visibility) || visibility === 'club' && !s.officer) throw new Error('공개 범위 권한 없음');
        if (!get('title')) throw new Error('제목을 입력해야 함');
        for (const key of ['date', 'endDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(get(key)) || Number.isNaN(dateObj(get(key)).valueOf()) || dateString(dateObj(get(key))) !== get(key)) throw new Error('날짜를 확인해야 함');
        validatePeriod(get('date'), get('endDate'));
        const start = minutes(get('start')), end = minutes(get('end'));
        if (!Number.isFinite(start + end) || start >= 1440 || end >= 1440 || get('date') === get('endDate') && end <= start) throw new Error('시작/종료 시각을 확인해야 함');
        if (!assignees.length || assignees.some(x => !uid(x) || !club && !chosen?.memberIds.includes(x))) throw new Error('활동 구성원 중 담당자를 지정해야 함');
        if (!['예정', '진행 중', '완료', '보류'].includes(get('status'))) throw new Error('진행 상태를 확인해야 함');
        const e: Event = { id: previous?.id || id('event'), workspaceId: club ? null : chosen!.id, title: get('title'), date: get('date'), endDate: get('endDate'), start: get('start'), end: get('end'), assigneeIds: assignees, work: get('work'), visibility, status: get('status'), createdBy: previous?.createdBy || s.userId, updatedAt: iso() };
        if (previous) Object.assign(previous, e); else m.events.push(e); break;
      }
      case 'event-delete': {
        const e = m.events.find(e => same(e.id, target)); if (!e || !eventEditable(e, m, s)) throw new Error('일정 삭제 권한 없음'); e.deleted = true; break;
      }
      case 'booking': {
        const previous = m.bookings.find(b => same(b.id, target)), chosen = workspace(m, get('workspaceId'));
        if (previous && !bookingEditable(previous, m, s)) throw new Error('예약 변경 권한 없음');
        if (!chosen || !(writable(chosen, s) || s.officer && chosen.status !== '보관')) throw new Error('예약 가능한 활동을 선택해야 함');
        if (!get('purpose')) throw new Error('사용 목적을 입력해야 함');
        if (previous?.status === '취소') throw new Error('이미 취소된 예약임');
        const b: Booking = { id: previous?.id || id('booking'), workspaceId: chosen.id, date: get('date'), start: get('start'), end: get('end'), purpose: get('purpose'), ownerId: previous?.ownerId || s.userId, status: '확정', createdAt: previous?.createdAt || iso(), updatedAt: iso(), updatedBy: s.userId };
        checkBooking(m, b, target); if (previous) Object.assign(previous, b); else m.bookings.push(b); break;
      }
      case 'booking-cancel': {
        const b = m.bookings.find(b => same(b.id, target));
        if (!b || !bookingEditable(b, m, s)) throw new Error('예약 취소 권한 없음');
        if (!get('reason')) throw new Error('취소 사유를 입력해야 함');
        Object.assign(b, { status: '취소', cancelReason: get('reason'), updatedBy: s.userId, updatedAt: iso() }); break;
      }
      case 'room': {
        requireMember(w, s); const ids = all('members'), tags = all('tags');
        if (!get('name')) throw new Error('방 이름을 입력해야 함');
        if (!ids.length || ids.some(x => !w.memberIds.includes(x))) throw new Error('활동 구성원을 한 명 이상 지정해야 함');
        if (tags.some(x => !(m.tagGroups[w.id] || []).flatMap(g => g.tags).some(t => t.id === x))) throw new Error('사용 가능한 태그를 선택해야 함');
        let r = m.rooms.find(r => same(r.id, target)); if (r && !same(r.workspaceId, w.id)) throw new Error('다른 활동의 방임');
        if (!r) { r = { id: id('room'), workspaceId: w.id, name: get('name'), memberIds: ids, tagIds: tags, messages: [], createdBy: s.userId, createdAt: iso() }; m.rooms.push(r); m.documents[r.id] = '# 회의록\n'; m.documentMeta[r.id] = { version: 1, updatedBy: s.userId, updatedAt: iso(), history: [] }; }
        else Object.assign(r, { name: get('name'), memberIds: ids, tagIds: tags }); break;
      }
      case 'room-archive': { const r = room(m, target); requireMember(workspace(m, r?.workspaceId), s); if (r) r.archived = true; break; }
      case 'group-new': case 'group-rename': case 'tag-new': case 'tag-rename': {
        requireMember(w, s); const groups = m.tagGroups[w.id] || (m.tagGroups[w.id] = []), g = groups.find(g => g.id === modal.groupId), title = get('name');
        if (!title) throw new Error('이름이 공백임');
        if (kind === 'group-new') { if (groups.some(g => g.name === title)) throw new Error('같은 그룹 이름 있음'); groups.push({ id: id('group'), name: title, tags: [] }); }
        else if (kind === 'group-rename') { const found = groups.find(g => same(g.id, target)); if (!found) throw new Error('그룹을 찾을 수 없음'); found.name = title; }
        else { if (!g) throw new Error('그룹을 찾을 수 없음'); if (kind === 'tag-new') { if (g.tags.some(t => t.name === title)) throw new Error('같은 태그 이름 있음'); g.tags.push({ id: id('tag'), name: title }); } else { const t = g.tags.find(t => same(t.id, target)); if (!t) throw new Error('태그를 찾을 수 없음'); t.name = title; } } break;
      }
      case 'group-delete': case 'tag-delete': {
        requireMember(w, s); const groups = m.tagGroups[w.id], g = groups.find(g => same(g.id, kind === 'group-delete' ? target : modal.groupId));
        if (!g) throw new Error('그룹을 찾을 수 없음');
        const ids = kind === 'group-delete' ? g.tags.map(t => t.id) : [String(target)];
        if (kind === 'group-delete') m.tagGroups[w.id] = groups.filter(x => x !== g); else g.tags = g.tags.filter(t => !ids.includes(t.id));
        for (const r of m.rooms.filter(r => same(r.workspaceId, w.id))) r.tagIds = r.tagIds.filter(t => !ids.includes(t)); break;
      }
      default: throw new Error('지원하지 않는 변경');
    }
  });
}

