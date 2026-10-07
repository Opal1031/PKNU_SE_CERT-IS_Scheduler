import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyForm, canChat, canView, checkBooking, fields, fresh, getDraft, getSnapshot, leader, loadPreferences, minutes, mutate, normalize, resetModel, room, saveDocument, setDraft, STORE, UI_STORE, updateMembers, visibleEvents, workspace } from '../src/model.ts';

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
