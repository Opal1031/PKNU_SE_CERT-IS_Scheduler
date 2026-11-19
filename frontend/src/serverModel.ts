// 서버 응답(api.ts)을 화면이 쓰는 자료 형식(model.ts)으로 바꾼다.
//
// 두 형식이 다른 곳은 세 군데다.
//   1) ID      서버는 숫자, 화면은 문자열(로컬 샘플 시절의 'minseo' 같은 값과 섞여 있음)
//   2) 시간    예약은 서버가 자정 기준 분(540), 화면은 'HH:MM'
//   3) 일정    서버는 startDate/startTime, 화면은 date/start
//
// 사용자 ID 는 문자열로 통일한다. 화면 곳곳이 string[] 을 전제하고 있어 숫자로 바꾸면
// 변경 범위가 훨씬 커지기 때문이다. 서버로 보낼 때 toUserId 로 되돌린다.

import type {
  ApiCalendarReservation,
  ApiDocument,
  ApiDocumentVersion,
  ApiEvent,
  ApiMessage,
  ApiPublicWorkspace,
  ApiReservation,
  ApiRoom,
  ApiTagGroup,
  ApiWorkspace
} from './api';
import type { Booking, DocumentMeta, Event, Message, Room, TagGroup, Workspace } from './model';

/** 서버의 숫자 ID 를 화면용 문자열로. */
export const toLocalId = (id: number): string => String(id);
/** 화면의 문자열 ID 를 서버용 숫자로. 숫자가 아니면 NaN 이 아니라 오류로 알린다. */
export function toServerId(id: string | number): number {
  const value = typeof id === 'number' ? id : Number(id);
  if (!Number.isInteger(value)) throw new Error(`서버 ID 가 아님: ${String(id)}`);
  return value;
}
/** 사용자 ID 목록 변환(화면 ← 서버). */
export const toLocalIds = (ids: number[]): string[] => ids.map(toLocalId);
/** 사용자 ID 목록 변환(화면 → 서버). */
export const toServerIds = (ids: (string | number)[]): number[] => ids.map(toServerId);

/** 자정 기준 분 → 'HH:MM'. 1440 은 '24:00' 으로 둔다(종료 시각 표현). */
export function minutesToTime(value: number): string {
  if (value === 1440) return '24:00';
  const hour = Math.floor(value / 60),
    minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
/** 'HH:MM' → 자정 기준 분. '24:00' 은 1440. */
export function timeToMinutes(value: string): number {
  if (value === '24:00') return 1440;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) throw new Error(`시각 형식이 아님: ${value}`);
  return hour * 60 + minute;
}
/** 'HH:MM:SS' 를 화면이 쓰는 'HH:MM' 으로 줄인다. */
export const trimSeconds = (value: string): string => value.slice(0, 5);
/** 화면의 'HH:MM' 을 서버가 받는 'HH:MM:SS' 로. */
export const withSeconds = (value: string): string => (value.length === 5 ? `${value}:00` : value);

/** 활동. 서버에 없는 화면 전용 항목(applicantIds)은 비워 둔다. */
export function toWorkspace(w: ApiWorkspace): Workspace {
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    initial: w.initial,
    field: w.field,
    status: w.status,
    memberIds: toLocalIds(w.memberIds),
    leaderId: toLocalId(w.leaderId),
    createdBy: toLocalId(w.createdBy),
    goal: w.goal,
    startDate: w.startDate ?? '',
    endDate: w.endDate ?? '',
    updatedAt: w.updatedAt
  };
}

/**
 * 비로그인 화면용 활동. 서버가 공개하지 않는 구성원·기간·팀장은 빈 값으로 둔다.
 * 로그인 화면과 같은 카드 컴포넌트를 쓰기 위해 Workspace 모양을 맞춘다.
 */
export function toPublicWorkspace(w: ApiPublicWorkspace): Workspace {
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    initial: w.initial,
    field: w.field,
    status: w.status,
    memberIds: [],
    leaderId: '',
    createdBy: '',
    goal: w.goal,
    startDate: '',
    endDate: '',
    updatedAt: ''
  };
}

/** 채팅방. 메시지는 따로 불러오므로 빈 배열로 둔다. */
export function toRoom(r: ApiRoom): Room {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    memberIds: toLocalIds(r.memberIds),
    tagIds: r.tagIds.map(toLocalId),
    messages: [],
    createdAt: r.createdAt,
    createdBy: toLocalId(r.createdBy),
    archived: r.archived
  };
}

export function toMessage(m: ApiMessage): Message {
  return { id: toLocalId(m.id), authorId: toLocalId(m.authorId), createdAt: m.createdAt, text: m.body };
}

/** 일정. 서버의 startDate/startTime 을 화면의 date/start 로 맞춘다. */
export function toEvent(e: ApiEvent): Event {
  return {
    id: e.id,
    workspaceId: e.workspaceId,
    title: e.title,
    date: e.startDate,
    endDate: e.endDate,
    start: trimSeconds(e.startTime),
    end: trimSeconds(e.endTime),
    visibility: e.visibility,
    assigneeIds: toLocalIds(e.assigneeIds),
    work: e.work,
    status: e.status,
    createdBy: toLocalId(e.createdBy),
    updatedAt: e.updatedAt
  };
}

/** 예약. 자정 기준 분을 'HH:MM' 으로 바꾼다. 가려진 목적(null)은 빈 문자열로 둔다. */
export function toBooking(r: ApiReservation): Booking {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    date: r.date,
    start: minutesToTime(r.startMinute),
    end: minutesToTime(r.endMinute),
    ownerId: toLocalId(r.ownerId),
    purpose: r.purpose ?? '',
    status: r.status,
    createdAt: r.updatedAt,
    updatedAt: r.updatedAt,
    cancelReason: r.cancelReason ?? undefined
  };
}

/** 캘린더에 함께 오는 예약(확정 건만, 취소 정보 없음). */
export function toCalendarBooking(r: ApiCalendarReservation): Booking {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    date: r.date,
    start: minutesToTime(r.startMinute),
    end: minutesToTime(r.endMinute),
    ownerId: toLocalId(r.ownerId),
    purpose: r.purpose ?? '',
    status: '확정',
    createdAt: ''
  };
}

/** 태그 그룹. 화면은 그룹 안에 태그가 들어 있는 형태를 쓴다. */
export function toTagGroup(g: ApiTagGroup): TagGroup {
  return {
    id: toLocalId(g.id),
    name: g.name,
    tags: g.tags.map(t => ({ id: toLocalId(t.id), name: t.name }))
  };
}

/** 회의록 메타(현재 버전·마지막 저장자·이력). */
export function toDocumentMeta(doc: ApiDocument, versions: ApiDocumentVersion[] = []): DocumentMeta {
  return {
    version: doc.version,
    updatedBy: toLocalId(doc.updatedBy),
    updatedAt: doc.updatedAt,
    history: versions.map(v => ({
      version: v.version,
      body: v.body,
      updatedBy: toLocalId(v.updatedBy),
      updatedAt: v.updatedAt
    }))
  };
}
