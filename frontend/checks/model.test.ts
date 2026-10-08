import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rankSurvey, surveyFields, surveyQuestions } from '../src/recommend.ts';
import { applyForm, calendarEvents, canChat, canView, dashboardDeadlines, checkBooking, fields, fresh, getDraft, getSnapshot, leader, loadPreferences, minutes, mutate, normalize, resetModel, room, saveDocument, setDraft, STORE, UI_STORE, updateMembers, visibleEvents, workspace } from '../src/model.ts';

const values = new Map<string, string>();
let unavailable = false;
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (unavailable) throw new Error('quota'); values.set(key, value); },
  removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
  key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; }
} });
const me = { userId: 'me', officer: false }, officer = { ...me, officer: true };
function form(data: Record<string, string | string[]>) { const f = new FormData(); for (const [key, value] of Object.entries(data)) for (const item of Array.isArray(value) ? value : [value]) f.append(key, item); return f; }
beforeEach(() => { unavailable = false; values.clear(); resetModel(); });

test('survey uses the documented weights, scores, unknown exclusions and shared ranks', () => {
  assert.equal(surveyQuestions.length, 15);
  assert.deepEqual(surveyFields.map((_, i) => surveyQuestions.reduce((sum, q) => sum + q.weights[i], 0)), [9, 9, 9, 9, 9]);
  const example = Array(15).fill(null); example[7] = 4;
  assert.deepEqual(rankSurvey(example).map(({ id, score, rank }) => [id, score, rank]), [['S', 8, 1], ['R', 4, 2], ['W', 0, 3], ['F', 0, 3], ['C', 0, 3]]);
  assert.ok(rankSurvey(Array(15).fill(4)).every(field => field.score === 36 && field.rank === 1));
  assert.ok(rankSurvey(Array(15).fill(0)).every(field => field.score === 0 && field.rank === 1));
  assert.deepEqual(rankSurvey(Array(15).fill(null)), []);
  assert.deepEqual(rankSurvey([]), []);
  for (const value of [-1, 5, 1.5, '4', undefined]) assert.throws(() => rankSurvey([value as number]), /응답/);
  assert.throws(() => rankSurvey(Array(16).fill(4)), /응답/);
});

test('survey preferences preserve separate users and reject invalid saved responses', () => {
  assert.deepEqual(loadPreferences().aiSurveys, {});
  values.set(UI_STORE, JSON.stringify({ aiField: 2, aiSubmitted: true, aiSurveys: { me: [0, null, 4], gitae: Array(15).fill(3), unknown: [4], minseo: [5], hyelim: 'bad', jisu: Array(16).fill(2), doyun: ['3'] } }));
  assert.deepEqual(loadPreferences().aiSurveys, { me: [0, null, 4], gitae: Array(15).fill(3) });
  values.set(UI_STORE, JSON.stringify({ aiSurveys: null }));
  assert.deepEqual(loadPreferences().aiSurveys, {});
});

test('personal calendar pins load old preferences and preserve separate users with multiple IDs', () => {
  assert.deepEqual(loadPreferences().calendarPins, {});
  values.set(UI_STORE, JSON.stringify({ userId: 'gitae', calendarPins: { me: [1, '1', 'event-2', null], gitae: ['event-3', 'event-4'], unknown: ['event-5'], minseo: 'bad' } }));
  const prefs = loadPreferences();
  assert.equal(prefs.userId, 'gitae');
  assert.deepEqual(prefs.calendarPins, { me: ['1', 'event-2'], gitae: ['event-3', 'event-4'] });
  values.set(UI_STORE, JSON.stringify({ calendarPins: null }));
  assert.deepEqual(loadPreferences().calendarPins, {});
});

test('legacy storage keeps content and supplies stable IDs, roles and external examples', () => {
  const old = fresh(); delete (old as Partial<typeof old>).schemaVersion;
  old.documents[1] = '기존 회의록';
  const m = normalize(old);
  assert.equal(m.documents[1], '기존 회의록'); assert.equal(m.schemaVersion, 2);
  assert.ok(m.rooms.every(r => r.messages.every(msg => msg.id && msg.authorId && msg.createdAt)));
  assert.equal(leader(workspace(m, 1), 'me'), true); assert.equal(leader(workspace(m, 2), 'me'), false);
  assert.equal(canView(workspace(m, 4), me), false); assert.equal(canView(workspace(m, 4), officer), true);
  assert.equal(canChat(m.rooms.find(r => r.workspaceId === 4), workspace(m, 4), officer), false);
});
test('creation makes the creator leader of another activity; delegation applies to only that team', () => {
  const wid = applyForm({ kind: 'workspace-new' }, form({ name: '추가 팀', type: 'study', field: fields[0], members: ['minseo'] }), me)!;
  assert.equal(leader(workspace(getSnapshot(), wid), 'me'), true);
  assert.equal(leader(workspace(getSnapshot(), 1), 'me'), true);
  applyForm({ kind: 'members', workspaceId: wid }, form({ members: ['me', 'minseo'], leader: 'minseo' }), me);
  assert.equal(leader(workspace(getSnapshot(), wid), 'minseo'), true);
  assert.equal(leader(workspace(getSnapshot(), 1), 'me'), true);
  assert.throws(() => applyForm({ kind: 'members', workspaceId: wid }, form({ members: ['me'], leader: 'me' }), me), /팀장/);
});
test('roster removal prunes room access, preserves records and requires a remaining leader', () => {
  const m = fresh(), w = workspace(m, 1)!; const messages = room(m, 1)!.messages.length;
  assert.throws(() => updateMembers(m, w, ['me'], 'minseo'), /팀장/);
  updateMembers(m, w, ['me'], 'me');
  assert.ok(m.rooms.filter(r => r.workspaceId === 1).every(r => r.memberIds.every(x => x === 'me')));
  assert.equal(room(m, 1)!.messages.length, messages);
});
test('reservation interval excludes adjacent and cancelled records; rejects overlap and invalid times', () => {
  const m = fresh(); m.bookings = [{ id: 900, workspaceId: 1, date: '2099-01-02', start: '10:00', end: '11:00', ownerId: 'me', status: '확정', createdAt: '' }];
  const b = { workspaceId: 1, date: '2099-01-02', start: '11:00', end: '11:30' };
  assert.doesNotThrow(() => checkBooking(m, b));
  assert.throws(() => checkBooking(m, { ...b, start: '10:30' }), /겹침/);
  assert.doesNotThrow(() => checkBooking(m, { ...b, start: '10:00', end: '11:00' }, 900));
  m.bookings[0].status = '취소'; assert.doesNotThrow(() => checkBooking(m, { ...b, start: '10:30' }));
  assert.throws(() => checkBooking(m, { ...b, date: '2000-01-01' }), /날짜/);
  assert.throws(() => checkBooking(m, { ...b, start: '10:99' }), /30분/);
  assert.ok(Number.isNaN(minutes('24:00')));
});
test('reservations allow closing at 24:00 but never start there or cross midnight', () => {
  const m = fresh(), b = { workspaceId: 1, date: '2099-01-02', start: '23:30', end: '24:00' };
  assert.doesNotThrow(() => checkBooking(m, b));
  for (const [start, end] of [['08:30', '09:00'], ['24:00', '01:00'], ['23:30', '00:00'], ['23:30', '24:30'], ['23:30', '01:00']]) {
    assert.throws(() => checkBooking(m, { ...b, start, end }), /09:00~24:00/);
  }
  m.bookings = [{ ...b, id: 902, ownerId: 'me', status: '확정', createdAt: '' }];
  assert.throws(() => checkBooking(m, { ...b, start: '23:00' }), /겹침/);
  assert.doesNotThrow(() => checkBooking(m, { ...b, start: '23:00', end: '23:30' }));
  applyForm({ kind: 'booking' }, form({ ...b, workspaceId: '1', purpose: '마지막 구간 확인' }), me);
  assert.equal(getSnapshot().bookings.at(-1)?.end, '24:00');
});
test('reservation save checks the latest local snapshot and cancellation frees its interval', () => {
  const external = structuredClone(getSnapshot()); external.revision++;
  external.bookings.push({ id: 901, workspaceId: 2, date: '2099-02-02', start: '10:00', end: '11:00', ownerId: 'minseo', status: '확정', createdAt: '' });
  values.set(STORE, JSON.stringify(external));
  const f = form({ workspaceId: '1', date: '2099-02-02', start: '10:00', end: '11:00', purpose: '검증' });
  assert.throws(() => applyForm({ kind: 'booking' }, f, me), /겹침/);
  applyForm({ kind: 'booking-cancel', id: 901 }, form({ reason: '검증' }), officer);
  assert.doesNotThrow(() => applyForm({ kind: 'booking' }, f, me));
});

test('calendar reads saved bookings directly and follows creation, edits and cancellation', () => {
  const f = { workspaceId: '1', date: '2099-02-02', start: '23:30', end: '24:00', purpose: '팀 회의' };
  applyForm({ kind: 'booking' }, form(f), me);
  const booking = getSnapshot().bookings.at(-1)!;
  const saved = normalize(JSON.parse(values.get(STORE)!));
  saved.events.push({ ...saved.events[0], id: booking.id });
  const entries = calendarEvents(saved, me), entry = entries.find(e => e.bookingId === booking.id)!;
  assert.equal(entry.title, `동아리방 예약 · ${workspace(saved, 1)!.name}`);
  assert.equal(entry.work, '팀 회의');
  assert.deepEqual([entry.date, entry.endDate, entry.start, entry.end, ...entry.assigneeIds], [f.date, f.date, '23:30', '24:00', 'me']);
  assert.equal(new Set(entries.map(e => String(e.id))).size, entries.length);
  assert.equal(calendarEvents(saved, me, workspace(saved, 1)).some(e => e.bookingId === booking.id), true);
  assert.equal(getSnapshot().events.some(e => e.id === entry.id), false);
  applyForm({ kind: 'booking', id: booking.id }, form({ ...f, date: '2099-02-03', start: '10:00', end: '11:00', purpose: '변경한 회의' }), me);
  const edited = calendarEvents(getSnapshot(), me).filter(e => e.bookingId === booking.id);
  assert.equal(edited.length, 1);
  assert.deepEqual([edited[0].id, edited[0].date, edited[0].start, edited[0].end, edited[0].work], [entry.id, '2099-02-03', '10:00', '11:00', '변경한 회의']);
  applyForm({ kind: 'booking-cancel', id: booking.id }, form({ reason: '회의 취소' }), me);
  assert.equal(calendarEvents(getSnapshot(), me).some(e => e.bookingId === booking.id), false);
  assert.equal(getSnapshot().bookings.at(-1)?.status, '취소');
});

test('calendar bookings respect membership, owner filters, team scope and officer scope', () => {
  const m = fresh(); m.events = [];
  const booking = { workspaceId: 1, date: '2099-02-02', start: '10:00', end: '11:00', ownerId: 'me', status: '확정', createdAt: '' };
  m.bookings = [
    { ...booking, id: 0 }, { ...booking, id: 'teammate', ownerId: 'minseo' },
    { ...booking, id: 'external', workspaceId: 4, ownerId: 'jisu' },
    { ...booking, id: 'cancelled', status: '취소' }
  ];
  assert.deepEqual(calendarEvents(m, me).map(e => e.bookingId), [0, 'teammate']);
  assert.deepEqual(calendarEvents(m, me, undefined, true).map(e => e.bookingId), [0]);
  assert.deepEqual(calendarEvents(m, me, undefined, false, 'all').map(e => e.bookingId), [0, 'teammate']);
  assert.deepEqual(calendarEvents(m, officer).map(e => e.bookingId), [0, 'teammate']);
  assert.deepEqual(calendarEvents(m, officer, undefined, false, 'all').map(e => e.bookingId), [0, 'teammate', 'external']);
  assert.deepEqual(calendarEvents(m, officer, workspace(m, 4)).map(e => e.bookingId), ['external']);
  assert.deepEqual(calendarEvents(m, me, workspace(m, 1), true).map(e => e.bookingId), [0]);
});
test('user/room drafts stay separate and only explicit saving changes the document version', () => {
  const saved = getSnapshot().documents[1], version = getSnapshot().documentMeta[1].version;
  setDraft('me', 1, { body: '내 초안', baseVersion: version, at: '' });
  setDraft('gitae', 1, { body: '다른 초안', baseVersion: version, at: '' });
  assert.equal(getSnapshot().documents[1], saved); assert.equal(getSnapshot().documentMeta[1].version, version);
  assert.equal(getDraft('me', 1)?.body, '내 초안'); assert.equal(getDraft('gitae', 1)?.body, '다른 초안');
  saveDocument(1, '확정', version, me);
  assert.equal(getSnapshot().documentMeta[1].version, version + 1);
  assert.equal(getSnapshot().documentMeta[1].history[0].body, saved);
  assert.throws(() => saveDocument(1, '덮어쓰기', version, me), /먼저 저장/);
  assert.equal(getSnapshot().documents[1], '확정');
});
test('failed local persistence rolls back the model without destroying the saved draft', () => {
  setDraft('me', 1, { body: '보존', baseVersion: 1, at: '' });
  const before = getSnapshot(); unavailable = true;
  assert.throws(() => saveDocument(1, '실패', before.documentMeta[1].version, me), /저장 공간/);
  assert.equal(getSnapshot(), before); assert.equal(getDraft('me', 1)?.body, '보존');
});
test('officer personal calendar defaults to membership; explicit operational scope still hides private events', () => {
  const m = fresh(); m.events.push({ id: 'private', workspaceId: 4, title: '비공개', date: '2099-01-01', endDate: '2099-01-01', start: '10:00', end: '11:00', visibility: 'private', assigneeIds: ['jisu'], work: '', status: '예정', createdBy: 'jisu' });
  assert.equal(visibleEvents(m, officer).some(e => e.workspaceId === 4 && e.visibility !== 'club'), false);
  assert.equal(visibleEvents(m, officer, undefined, false, 'all').some(e => e.workspaceId === 4), true);
  assert.equal(visibleEvents(m, officer, undefined, false, 'all').some(e => e.id === 'private'), false);
});
test('external officer cannot save a document; archived workspace is read only', () => {
  const m = getSnapshot(), r = m.rooms.find(r => r.workspaceId === 4)!;
  assert.throws(() => saveDocument(r.id, '외부 변경', 1, officer), /구성원/);
  mutate('보관', me, next => { workspace(next, 1)!.status = '보관'; });
  assert.throws(() => saveDocument(1, '보관 변경', 1, me), /조회 전용/);
});


test('participation requests persist without granting access, reject duplicates and can be approved by the leader', () => {
  const request = { kind: 'workspace-apply' as const, workspaceId: 4 };
  applyForm(request, form({}), me);
  const pending = workspace(getSnapshot(), 4)!;
  assert.deepEqual(pending.applicantIds, ['me']);
  assert.equal(canView(pending, me), false);
  assert.deepEqual(normalize(JSON.parse(values.get(STORE)!)).workspaces.find(w => w.id === 4)!.applicantIds, ['me']);
  assert.throws(() => applyForm(request, form({}), me), /이미 신청/);
  assert.throws(() => applyForm({ ...request, workspaceId: 1 }, form({}), me), /이미 참여/);
  assert.throws(() => applyForm({ ...request, workspaceId: 'missing' }, form({}), me), /확인/);
  assert.throws(() => applyForm(request, form({}), { userId: 'unknown', officer: false }), /확인/);
  assert.throws(() => applyForm({ kind: 'members', workspaceId: 4 }, form({ members: [...pending.memberIds, 'me'], leader: pending.leaderId }), me), /팀장/);
  applyForm({ kind: 'members', workspaceId: 4 }, form({ members: [...pending.memberIds, 'me'], leader: pending.leaderId }), { userId: pending.leaderId, officer: false });
  assert.equal(canView(workspace(getSnapshot(), 4), me), true);
  assert.deepEqual(workspace(getSnapshot(), 4)!.applicantIds, []);
  mutate('종료 예시', officer, m => { workspace(m, 5)!.status = '완료'; });
  assert.throws(() => applyForm({ ...request, workspaceId: 5 }, form({}), me), /종료된/);
});

test('request storage failure leaves no pending request', () => {
  unavailable = true;
  assert.throws(() => applyForm({ kind: 'workspace-apply', workspaceId: 4 }, form({}), me), /저장/);
  assert.deepEqual(workspace(getSnapshot(), 4)!.applicantIds, []);
});

test('D-day sorts unfinished deadlines and respects membership and private event visibility', () => {
  const m = fresh();
  m.events = [];
  workspace(m, 1)!.endDate = '2026-10-11';
  workspace(m, 4)!.endDate = '2026-10-09';
  const event = { id: 'due', workspaceId: 1, title: '오늘 일정', date: '2026-10-08', endDate: '2026-10-08', start: '10:00', end: '11:00', visibility: 'workspace', assigneeIds: ['me'], work: '', status: '예정', createdBy: 'me' };
  m.events.push(event, { ...event, id: 'overdue', endDate: '2026-10-07' }, { ...event, id: 'private', visibility: 'private', assigneeIds: ['minseo'] }, { ...event, id: 'done', status: '완료' }, { ...event, id: 'deleted', deleted: true }, { ...event, id: 'external', workspaceId: 4 }, { ...event, id: 'club', workspaceId: null, visibility: 'club', endDate: '2026-10-10' });
  const due = dashboardDeadlines(m, me, '2026-10-08');
  assert.deepEqual(due.map(d => d.days), [-1, 0, 2, 3]);
  assert.deepEqual(due.map(d => d.key), ['event-overdue', 'event-due', 'event-club', 'workspace-1']);
  const all = dashboardDeadlines(m, officer, '2026-10-08');
  assert.equal(all.some(d => d.key === 'workspace-4'), true);
  assert.equal(all.some(d => d.key === 'event-private'), false);
  workspace(m, 1)!.status = '완료';
  assert.deepEqual(dashboardDeadlines(m, me, '2026-10-08').map(d => d.key), ['event-club']);
});
