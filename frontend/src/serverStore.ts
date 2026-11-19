// 서버에서 화면 자료(Model)를 만들고, 대화상자 제출을 서버 API 호출로 보낸다.
//
// 지금까지 화면은 localStorage 한 벌을 읽고 썼다. 이 파일이 그 자리를 대신한다.
// 화면 컴포넌트는 그대로 두고 자료의 출처만 바꾸는 것이 목적이라, 돌려주는 형식은
// model.ts 의 Model 과 같게 맞춘다(변환은 serverModel.ts).

import * as api from './api';
import type { ModalState, Model, Session, TagGroup, Workspace } from './model';
import { iso, name as userName, validatePeriod } from './model';
import {
  timeToMinutes,
  toBooking,
  toCalendarBooking,
  toEvent,
  toLocalId,
  toPublicWorkspace,
  toRoom,
  toServerId,
  toServerIds,
  toTagGroup,
  toWorkspace,
  withSeconds
} from './serverModel';

/** 예약·일정을 한 번에 받아 올 기간. 화면이 보여 주는 범위(예약 28일, 캘린더 월간)를 넉넉히 덮는다. */
const WINDOW_BEFORE_DAYS = 60;
const WINDOW_AFTER_DAYS = 180;

function windowRange(): { from: string; to: string } {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return { from: day(-WINDOW_BEFORE_DAYS), to: day(WINDOW_AFTER_DAYS) };
}

/**
 * 서버 자료로 Model 을 만든다.
 *
 * 활동마다 방·태그를 따로 받아야 해서 요청이 활동 수만큼 늘어난다. 동아리 규모에서는
 * 활동이 많지 않아 병렬 호출로 충분하다. 느려지면 서버에 합본 엔드포인트를 두는 편이 낫다.
 */
export async function loadModel(): Promise<Model> {
  const { from, to } = windowRange();
  const [workspaces, reservations, calendar] = await Promise.all([
    api.listWorkspaces({ scope: 'mine' }),
    api.listReservations(from, to, true),
    api.fetchCalendar(from, to)
  ]);

  // 활동별 방·태그 그룹. 참여하지 않은 활동(임원진 조회)에서는 403 이 날 수 있어 빈 값으로 넘긴다.
  const details = await Promise.all(
    workspaces.map(async w => {
      const [rooms, tagGroups] = await Promise.all([
        api.listRooms(w.id).catch(() => []),
        api.listTagGroups(w.id).catch(() => [])
      ]);
      return { id: w.id, rooms, tagGroups };
    })
  );

  const model: Model = {
    schemaVersion: 2,
    revision: Date.now(),
    workspaces: workspaces.map(toWorkspace),
    rooms: details.flatMap(d => d.rooms.map(toRoom)),
    // 캘린더가 돌려준 일정만 쓴다. 예약은 목록 API 쪽이 취소 건까지 담아 더 완전하다.
    events: calendar.events.map(toEvent),
    bookings: reservations.length ? reservations.map(toBooking) : calendar.reservations.map(toCalendarBooking),
    tagGroups: {},
    documents: {},
    documentMeta: {},
    audit: []
  };

  // 화면이 쓰는 표시용 값(구성원 수·이름)과 활동별 태그 그룹을 채운다.
  for (const w of model.workspaces) {
    w.members = w.memberIds.length;
    w.memberNames = w.memberIds.map(userName);
    w.applicantIds = [];
  }
  for (const d of details) {
    model.tagGroups[d.id] = d.tagGroups.map(toTagGroup) as TagGroup[];
  }
  // 회의록은 방을 열 때 따로 불러온다. 여기서는 화면이 기대하는 빈 자리만 만들어 둔다.
  for (const r of model.rooms) {
    model.documents[r.id] ??= '';
    model.documentMeta[r.id] ??= { version: 1, updatedBy: String(r.createdBy ?? ''), updatedAt: iso(), history: [] };
  }
  return model;
}

/** 방 하나의 회의록과 이력을 받아 Model 에 채운다(회의록 화면을 열 때 호출). */
export async function loadDocument(model: Model, roomId: number): Promise<Model> {
  const [doc, versions] = await Promise.all([api.fetchDocument(roomId), api.fetchDocumentVersions(roomId)]);
  return {
    ...model,
    documents: { ...model.documents, [roomId]: doc.body },
    documentMeta: {
      ...model.documentMeta,
      [roomId]: {
        version: doc.version,
        updatedBy: toLocalId(doc.updatedBy),
        updatedAt: doc.updatedAt,
        history: versions.map(v => ({
          version: v.version,
          body: v.body,
          updatedBy: toLocalId(v.updatedBy),
          updatedAt: v.updatedAt
        }))
      }
    }
  };
}

/** 방의 메시지를 받아 Model 에 채운다. after 를 주면 그 뒤의 새 메시지만 덧붙인다. */
export async function loadMessages(model: Model, roomId: number, after?: number): Promise<Model> {
  const messages = await api.listMessages(roomId, after ? { after } : {});
  if (!messages.length && after) return model;
  const incoming = messages.map(m => ({
    id: toLocalId(m.id),
    authorId: toLocalId(m.authorId),
    createdAt: m.createdAt,
    text: m.body
  }));
  return {
    ...model,
    rooms: model.rooms.map(r =>
      String(r.id) === String(roomId) ? { ...r, messages: after ? [...r.messages, ...incoming] : incoming } : r
    )
  };
}

// 폼 값 읽기 도우미. 앞뒤 공백을 지운 한 값과 같은 이름의 여러 값.
const reader = (f: FormData) => ({
  get: (key: string) => String(f.get(key) || '').trim(),
  all: (key: string) => f.getAll(key).map(String)
});

/**
 * 대화상자 제출을 서버 API 호출로 보낸다.
 *
 * 돌려주는 값은 화면이 이동할 대상 ID(활동 생성 시 새 활동 ID)다. 호출한 쪽은 이 함수가
 * 끝난 뒤 loadModel 로 자료를 다시 받아야 한다. 서버가 최종 상태를 정하므로, 응답을
 * 부분적으로 끼워 넣기보다 다시 읽는 편이 어긋날 여지가 없다.
 */
export async function submitForm(modal: ModalState, f: FormData, s: Session): Promise<number | undefined> {
  const { get, all } = reader(f);
  const workspaceId = modal.workspaceId ?? get('workspaceId');
  const wid = () => toServerId(workspaceId);
  const targetId = () => toServerId(modal.id!);

  switch (modal.kind) {
    case 'workspace-apply':
      await api.applyToWorkspace(wid());
      return;

    case 'workspace-new': {
      const title = get('name');
      if (!title) throw new Error('활동 이름을 입력해야 함');
      validatePeriod(get('startDate'), get('endDate'));
      const created = await api.createWorkspace({
        type: get('type') as api.WorkspaceType,
        name: title,
        initial: title.slice(0, 2).toUpperCase(),
        field: get('field'),
        goal: get('goal'),
        startDate: get('startDate') || null,
        endDate: get('endDate') || null,
        // 만든 사람은 서버가 넣으므로 보내지 않는다.
        memberIds: toServerIds(all('members').filter(x => x !== s.userId))
      });
      return created.id;
    }

    case 'workspace-edit':
      validatePeriod(get('startDate'), get('endDate'));
      await api.updateWorkspace(wid(), {
        name: get('name'),
        field: get('field'),
        goal: get('goal'),
        status: get('status') as api.WorkspaceStatus,
        startDate: get('startDate') || null,
        endDate: get('endDate') || null
      });
      return;

    case 'members': {
      const memberIds = toServerIds(all('members'));
      const leaderId = toServerId(get('leader'));
      await api.updateWorkspaceMembers(wid(), memberIds, leaderId);
      return;
    }

    case 'leave':
      await api.leaveWorkspace(wid());
      return;

    case 'event': {
      const body = {
        title: get('title'),
        startDate: get('date'),
        endDate: get('endDate') || get('date'),
        startTime: withSeconds(get('start')),
        endTime: withSeconds(get('end')),
        status: (get('status') || '예정') as api.EventStatus,
        work: get('work'),
        assigneeIds: toServerIds(all('assignees'))
      };
      validatePeriod(body.startDate, body.endDate);
      if (modal.id) await api.updateEvent(targetId(), body);
      else {
        const visibility = (get('visibility') || 'workspace') as api.EventVisibility;
        await api.createEvent({
          ...body,
          visibility,
          // 동아리 전체 일정은 활동에 속하지 않는다(서버가 workspaceId 를 받지 않는다).
          workspaceId: visibility === 'club' ? null : wid()
        });
      }
      return;
    }

    case 'event-delete':
      await api.deleteEvent(targetId());
      return;

    case 'booking': {
      const body = {
        date: get('date'),
        startMinute: timeToMinutes(get('start')),
        endMinute: timeToMinutes(get('end')),
        purpose: get('purpose')
      };
      if (modal.id) await api.updateReservation(targetId(), body);
      else await api.createReservation({ workspaceId: wid(), ...body });
      return;
    }

    case 'booking-cancel':
      await api.cancelReservation(targetId(), get('reason') || '사유 없음');
      return;

    case 'room': {
      const roomName = get('name');
      if (!roomName) throw new Error('방 이름을 입력해야 함');
      const members = toServerIds(all('members'));
      const tags = toServerIds(all('tags'));
      if (modal.id) await api.updateRoom(targetId(), { name: roomName, memberIds: members, tagIds: tags });
      else await api.createRoom(wid(), { name: roomName, memberIds: members, tagIds: tags });
      return;
    }

    case 'room-archive':
      await api.updateRoom(targetId(), { archived: get('archived') !== 'false' });
      return;

    case 'group-new':
      await api.createTagGroup(wid(), get('name'));
      return;

    case 'tag-new':
      await api.createTag(toServerId(modal.groupId!), get('name'));
      return;

    case 'tag-delete':
      await api.deleteTag(targetId());
      return;

    // 서버에 아직 없는 작업. 화면이 조용히 성공한 것처럼 보이지 않도록 분명히 알린다.
    case 'group-rename':
    case 'tag-rename':
    case 'group-delete':
      throw new Error('이름 변경과 그룹 삭제는 아직 서버에 연결되지 않았어요.');

    default:
      throw new Error(`아직 서버에 연결되지 않은 작업이에요: ${modal.kind}`);
  }
}

/** 활동 보관(목록에서 치우기). 삭제 대신 쓰는 정리 수단. */
export async function archiveWorkspace(w: Workspace): Promise<void> {
  await api.archiveWorkspace(toServerId(w.id));
}

/**
 * 비로그인 '진행 중인 활동' 화면에 쓸 활동 목록. 공개 API 라 토큰이 없어도 받을 수 있고,
 * 실패하면 빈 목록으로 두어 소개 화면 자체는 계속 보이게 한다.
 */
export async function loadPublicWorkspaces(): Promise<Workspace[]> {
  const list = await api.listPublicWorkspaces();
  return list.map(toPublicWorkspace);
}

/** 자료가 없는 빈 Model. 로그아웃·세션 만료 때 화면에 남은 내용을 지우는 데 쓴다. */
export function emptyModel(): Model {
  return {
    schemaVersion: 2,
    revision: Date.now(),
    workspaces: [],
    rooms: [],
    events: [],
    bookings: [],
    tagGroups: {},
    documents: {},
    documentMeta: {},
    audit: []
  };
}
