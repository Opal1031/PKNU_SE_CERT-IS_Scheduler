// 서버 응답 ↔ 화면 자료 형식 변환 테스트. 백엔드 없이 node --test 로 실행한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesToTime,
  timeToMinutes,
  toBooking,
  toCalendarBooking,
  toDocumentMeta,
  toEvent,
  toLocalIds,
  toMessage,
  toRoom,
  toServerId,
  toServerIds,
  toTagGroup,
  toWorkspace,
  trimSeconds,
  withSeconds
} from '../src/serverModel.ts';

test('시각 변환: 분 ↔ HH:MM, 24:00 은 1440', () => {
  assert.equal(minutesToTime(540), '09:00');
  assert.equal(minutesToTime(600), '10:00');
  assert.equal(minutesToTime(630), '10:30');
  assert.equal(minutesToTime(1440), '24:00');
  assert.equal(timeToMinutes('09:00'), 540);
  assert.equal(timeToMinutes('10:30'), 630);
  assert.equal(timeToMinutes('24:00'), 1440);
  // 왕복해도 같은 값
  for (const m of [540, 570, 720, 1410, 1440]) assert.equal(timeToMinutes(minutesToTime(m)), m);
  assert.throws(() => timeToMinutes('열시'), /시각 형식/);
});

test('초 단위 처리: 서버는 HH:MM:SS, 화면은 HH:MM', () => {
  assert.equal(trimSeconds('14:30:00'), '14:30');
  assert.equal(withSeconds('14:30'), '14:30:00');
  assert.equal(withSeconds('14:30:00'), '14:30:00'); // 이미 초가 있으면 그대로
});

test('ID 변환: 서버 숫자 ↔ 화면 문자열', () => {
  assert.deepEqual(toLocalIds([1, 2, 3]), ['1', '2', '3']);
  assert.deepEqual(toServerIds(['1', 2]), [1, 2]);
  assert.equal(toServerId(7), 7);
  // 숫자가 아닌 옛 로컬 ID 는 조용히 NaN 이 되지 않고 오류로 알린다
  assert.throws(() => toServerId('minseo'), /서버 ID 가 아님/);
});

test('활동 변환: 기간이 비어 있으면 빈 문자열', () => {
  const w = toWorkspace({
    id: 1, type: 'project', name: '활동', initial: 'AC', field: '웹 보안', status: '진행 중',
    goal: '목표', startDate: null, endDate: null, leaderId: 3, createdBy: 3,
    memberIds: [3, 4], updatedAt: '2026-11-19T00:00:00Z', myRole: 'leader'
  });
  assert.equal(w.id, 1);
  assert.deepEqual(w.memberIds, ['3', '4']);
  assert.equal(w.leaderId, '3');
  assert.equal(w.startDate, '');
  assert.equal(w.endDate, '');
});

test('일정 변환: startDate/startTime 을 date/start 로', () => {
  const e = toEvent({
    id: 5, workspaceId: 1, title: '회의', startDate: '2026-12-01', endDate: '2026-12-01',
    startTime: '14:00:00', endTime: '15:30:00', visibility: 'workspace', status: '예정',
    work: '안건 정리', assigneeIds: [3], createdBy: 3, canEdit: true, updatedAt: '2026-11-19T00:00:00Z'
  });
  assert.equal(e.date, '2026-12-01');
  assert.equal(e.start, '14:00');
  assert.equal(e.end, '15:30');
  assert.deepEqual(e.assigneeIds, ['3']);
});

test('동아리 전체 일정은 workspaceId 가 null 로 유지됨', () => {
  const e = toEvent({
    id: 6, workspaceId: null, title: '총회', startDate: '2026-12-05', endDate: '2026-12-05',
    startTime: '18:00:00', endTime: '20:00:00', visibility: 'club', status: '예정',
    work: '', assigneeIds: [], createdBy: 1, canEdit: false, updatedAt: ''
  });
  assert.equal(e.workspaceId, null);
  assert.equal(e.visibility, 'club');
});

test('예약 변환: 분을 HH:MM 으로, 가려진 목적은 빈 문자열', () => {
  const base = {
    id: 2, workspaceId: 1, workspaceName: '활동', ownerId: 3, date: '2026-12-01',
    startMinute: 600, endMinute: 720, status: '확정' as const, cancelReason: null,
    canEdit: true, updatedAt: '2026-11-19T00:00:00Z'
  };
  const mine = toBooking({ ...base, purpose: '스터디' });
  assert.equal(mine.start, '10:00');
  assert.equal(mine.end, '12:00');
  assert.equal(mine.purpose, '스터디');
  // 다른 팀 예약은 서버가 purpose 를 null 로 가린다
  const other = toBooking({ ...base, purpose: null });
  assert.equal(other.purpose, '');
  assert.equal(other.start, '10:00'); // 시간은 그대로 보인다
});

test('취소된 예약은 사유를 함께 가져옴', () => {
  const b = toBooking({
    id: 3, workspaceId: 1, workspaceName: '활동', ownerId: 3, date: '2026-12-01',
    startMinute: 600, endMinute: 660, purpose: '스터디', status: '취소',
    cancelReason: '일정 변경', canEdit: true, updatedAt: ''
  });
  assert.equal(b.status, '취소');
  assert.equal(b.cancelReason, '일정 변경');
});

test('캘린더 예약은 항상 확정 상태로 변환됨', () => {
  const b = toCalendarBooking({
    id: 4, workspaceId: 1, workspaceName: '활동', ownerId: 3,
    date: '2026-12-01', startMinute: 1380, endMinute: 1440, purpose: null
  });
  assert.equal(b.status, '확정');
  assert.equal(b.start, '23:00');
  assert.equal(b.end, '24:00'); // 자정 종료가 24:00 으로 보존됨
});

test('채팅방 변환: 메시지는 따로 불러오므로 빈 배열', () => {
  const r = toRoom({
    id: 9, workspaceId: 1, name: '일반', archived: false,
    memberIds: [3, 4], tagIds: [7], createdBy: 3, createdAt: '2026-11-19T00:00:00Z'
  });
  assert.deepEqual(r.messages, []);
  assert.deepEqual(r.memberIds, ['3', '4']);
  assert.deepEqual(r.tagIds, ['7']);
  assert.equal(r.archived, false);
});

test('메시지 변환: body 를 text 로', () => {
  const m = toMessage({ id: 11, roomId: 9, authorId: 3, body: '안녕', createdAt: '2026-11-19T00:00:00Z' });
  assert.equal(m.text, '안녕');
  assert.equal(m.authorId, '3');
  assert.equal(m.id, '11');
});

test('태그 그룹 변환: 그룹 안에 태그가 들어감', () => {
  const g = toTagGroup({
    id: 1, workspaceId: 1, name: '주차', position: 0,
    tags: [{ id: 7, groupId: 1, name: '1주차', position: 0 }]
  });
  assert.equal(g.id, '1');
  assert.deepEqual(g.tags, [{ id: '7', name: '1주차' }]);
});

test('회의록 메타 변환: 이력은 최신순 그대로', () => {
  const meta = toDocumentMeta(
    { roomId: 9, body: '본문', version: 3, updatedBy: 3, updatedAt: '2026-11-19T02:00:00Z' },
    [
      { version: 2, body: '이전', updatedBy: 4, updatedAt: '2026-11-19T01:00:00Z' },
      { version: 1, body: '', updatedBy: 3, updatedAt: '2026-11-19T00:00:00Z' }
    ]
  );
  assert.equal(meta.version, 3);
  assert.equal(meta.updatedBy, '3');
  assert.deepEqual(meta.history.map(h => h.version), [2, 1]);
  assert.equal(meta.history[0].updatedBy, '4');
});

test('이력이 없으면 빈 배열', () => {
  const meta = toDocumentMeta({ roomId: 9, body: '', version: 1, updatedBy: 3, updatedAt: '' });
  assert.deepEqual(meta.history, []);
});
