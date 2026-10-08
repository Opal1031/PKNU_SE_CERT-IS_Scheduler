import { id, iso, mutate, name, requireMember, room, same, stamp, workspace } from '../model';
import { Heading } from '../ui';
import type { ViewProps } from '../ui';

export function Settings({ model, session, prefs, setPrefs, open, notify }: ViewProps) {
  function simulate() {
    try {
      const activity = workspace(model, prefs.chatWorkspaceId);
      requireMember(activity, session);
      const rooms = model.rooms.filter(r => same(r.workspaceId, activity.id) && r.memberIds.includes(session.userId) && !r.archived);
      const selectedRoom = rooms.find(r => same(r.id, prefs.chatRooms[activity.id])) || rooms.at(-1);
      const other = selectedRoom?.memberIds.find(userId => userId !== session.userId);
      if (!selectedRoom || !other) throw new Error('다른 참여자가 있는 방이 필요함');
      // 실제 수신이 아닌 예시도 같은 저장 경로를 거쳐 실패 시 기존 대화를 보존한다.
      mutate('수신 예시', { ...session, userId: other }, next => {
        room(next, selectedRoom.id)!.messages.push({ id: id('msg'), authorId: other, createdAt: iso(), text: '수신 예시: 현재 작업을 유지하면서 새 대화를 확인할 수 있음' });
      });
      notify('수신 예시 추가됨');
    } catch (error) {
      notify((error as Error).message);
    }
  }
  return <>
    <Heading title="설정" />
    <section className="settings-block">
      <div className="settings-row">
        <div>
          <h2>사용자 미리보기</h2>
          <p>{name(session.userId)} · {session.officer ? '임원진' : '일반 부원'} · 팀장은 활동별 관계로 결정됨</p>
        </div>
        <button className="button small" onClick={() => open({ kind: 'profile' })}>변경</button>
      </div>
    </section>
    <section className="settings-block">
      <div className="settings-row">
        <div>
          <h2>화면 설정</h2>
          <p>채팅 폭과 최근 방, 접기 상태를 이 브라우저에 보관함</p>
        </div>
        <button className="button small" onClick={() => setPrefs({ chatWidth: 300, collapsed: false })}>초기화</button>
      </div>
    </section>
    <section className="settings-block">
      <div className="settings-row">
        <div>
          <h2>대화 수신 예시</h2>
          <p>실시간 연결 없이 스크롤·미확인 표시를 점검하는 도구임</p>
        </div>
        <button className="button small" onClick={simulate}>메시지 추가</button>
      </div>
    </section>
    <section className="settings-block">
      <div className="settings-row">
        <div>
          <h2>샘플 데이터</h2>
          <p>예약·일정·문서·활동·초안을 초기화함</p>
        </div>
        <button className="button danger small" onClick={() => open({ kind: 'reset' })}>초기화</button>
      </div>
    </section>
    <section className="settings-block">
      <h2>최근 변경</h2>
      {model.audit.slice(0, 12).map(a => <p className="note-line" key={a.id}>{stamp(a.at)} · {name(a.userId)} · {a.action}</p>)}
      {!model.audit.length && <p className="note-line">변경 기록 없음</p>}
    </section>
  </>;
}
