// 활동 채팅 사이드바. 현재 활동에서 참여 중인 방의 메시지를 보고 보내며,
// 방 목록·메시지 검색·태그 필터 오버레이와 메시지의 회의록 인용 기능을 제공한다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Room, Workspace } from './model';
import {
  canChat,
  canReadChat,
  id,
  iso,
  mutate,
  name,
  requireMember,
  room,
  same,
  stamp,
  url,
  workspace,
  writable
} from './model';
import { Icon, IconButton } from './ui';
import type { ViewProps } from './ui';

/** 활동별 채팅 사이드바. 방 선택, 메시지 전송, 읽음 기록, 스크롤 위치 유지를 맡는다. */
export default function Chat({
  model: m,
  session: s,
  prefs: p,
  setPrefs,
  open,
  notify,
  activity: w,
  quote
}: ViewProps & { activity?: Workspace; quote: (r: Room, text: string) => void }) {
  // 읽을 수 있는 방 목록과 현재 방(저장된 선택이 없으면 마지막 방).
  // readKey는 사용자·방별 읽음 위치와 입력 초안을 저장하는 키
  const rooms = m.rooms.filter(r => same(r.workspaceId, w?.id) && canReadChat(r, w, s));
  const r = rooms.find(r => same(r.id, p.chatRooms[String(w?.id)])) || rooms.at(-1);
  const rid = r?.id,
    readKey = `${s.userId}:${rid}`;

  // 화면 상태: 열린 오버레이, 방 이름·메시지 검색어, 태그 필터, 방별 표시 개수, 새 메시지 버튼
  const [overlay, setOverlay] = useState<'rooms' | 'search' | 'tags' | null>(null);
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [tags, setTags] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({}),
    [hasNew, setHasNew] = useState(false);

  // 스크롤 제어용 값: 메시지 영역, 방별 스크롤 위치, 맨 아래 여부, 직전에 보던 방,
  // 이전 메시지 불러오기 전 위치, 검색 결과로 이동할 메시지, 전송 후 맨 아래 이동 요청
  const messages = useRef<HTMLDivElement>(null),
    positions = useRef<Record<string, number>>({});
  const bottom = useRef(true),
    previousRoom = useRef<Room['id'] | undefined>(undefined);
  const older = useRef<{ top: number; height: number } | null>(null),
    jump = useRef<string | null>(null),
    forceBottom = useRef(false);

  // 현재 방에 보여 줄 메시지 수(기본 최근 30개)와 활동의 태그 그룹
  const limit = limits[String(rid)] || 30;
  const groups = m.tagGroups[String(w?.id)] || [];
  // 마지막으로 읽은 메시지 이후 다른 사람이 보낸 메시지 수
  const unread = (x: Room) =>
    x.messages
      .slice(x.messages.findIndex(msg => msg.id === p.reads[`${s.userId}:${x.id}`]) + 1)
      .filter(msg => msg.authorId !== s.userId).length;
  // 현재 방의 마지막 메시지를 읽음으로 기록(오버레이가 열려 있으면 하지 않음)
  function readLast() {
    if (r?.messages.length && !overlay && p.reads[readKey] !== r.messages.at(-1)!.id)
      setPrefs({ reads: { ...p.reads, [readKey]: r.messages.at(-1)!.id } });
  }

  // 활동이나 사용자가 바뀌면 오버레이와 검색어·태그 필터를 초기화
  useLayoutEffect(() => {
    setOverlay(null);
    setTags([]);
    setQuery('');
    setSearch('');
  }, [w?.id, s.userId]);
  // 메시지 영역 스크롤 조정: 방을 바꾸면 이전 위치 복원, 이전 메시지를 불러오면 보던 위치 유지,
  // 전송 직후나 맨 아래를 보던 중이면 끝으로 이동. 검색 결과로 들어오면 그 메시지로 이동한다.
  useLayoutEffect(() => {
    const el = messages.current;
    if (!el || !r) return;
    if (!same(previousRoom.current, r.id)) {
      el.scrollTop = positions.current[String(r.id)] ?? el.scrollHeight;
      previousRoom.current = r.id;
    } else if (older.current) {
      el.scrollTop = older.current.top + el.scrollHeight - older.current.height;
      older.current = null;
    } else if (forceBottom.current || bottom.current) el.scrollTop = el.scrollHeight;
    if (jump.current) {
      document.getElementById(`message-${jump.current}`)?.scrollIntoView({ block: 'center' });
      jump.current = null;
    }
    // 맨 아래 여부를 다시 계산해 새 메시지 버튼과 읽음 기록에 반영
    forceBottom.current = false;
    bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setHasNew(!bottom.current);
    if (bottom.current) readLast();
  }, [rid, r?.messages.length, limit, overlay]);
  // Esc 키로 오버레이 닫기
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverlay(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  // 방 선택. 검색 결과에서 고른 경우 그 방의 메시지를 모두 펼치고 해당 메시지로 이동
  function selectRoom(next: Room, msgId?: string) {
    if (msgId) {
      jump.current = msgId;
      setLimits(old => ({ ...old, [next.id]: next.messages.length }));
    }
    setPrefs({ chatRooms: { ...p.chatRooms, [next.workspaceId]: next.id } });
    setOverlay(null);
  }
  // 메시지 전송. 최신 자료 기준으로 참여 권한을 다시 확인한 뒤 추가하고 입력 초안을 비움
  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!r) return;
    const text = (p.messageDrafts[readKey] || '').trim();
    try {
      if (!text) throw new Error('메시지를 입력해야 함');
      forceBottom.current = true;
      mutate('메시지 전송', s, next => {
        const target = room(next, r.id),
          owner = workspace(next, target?.workspaceId);
        requireMember(owner, s);
        if (!canChat(target, owner, s)) throw new Error('참여 권한이 변경됨');
        target!.messages.push({ id: id('msg'), authorId: s.userId, createdAt: iso(), text });
      });
      setPrefs({ messageDrafts: { ...p.messageDrafts, [readKey]: '' } });
    } catch (error) {
      forceBottom.current = false;
      notify((error as Error).message);
    }
  }

  // 방 목록: 이름 검색·태그 필터 적용 후 정렬(이름순, 기준 그룹의 태그 순서, 최근 대화순)
  const group = groups.find(g => g.id === p.roomSortGroup);
  const rank = (x: Room) =>
    Math.min(...x.tagIds.map(t => group?.tags.findIndex(a => a.id === t) ?? -1).filter(i => i >= 0), 999);
  const filtered = rooms
    .filter(x => x.name.includes(query) && tags.every(t => x.tagIds.includes(t)))
    .sort((a, b) =>
      p.roomSort === 'name'
        ? a.name.localeCompare(b.name, 'ko')
        : p.roomSort === 'tag'
          ? rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko')
          : (b.messages.at(-1)?.createdAt || b.createdAt).localeCompare(a.messages.at(-1)?.createdAt || a.createdAt)
    );
  // 메시지 검색: 읽을 수 있는 방들에서 검색어가 든 메시지를 최대 50개 모아 역순으로 표시
  const found = search.trim()
    ? rooms
        .flatMap(x => x.messages.filter(msg => msg.text.includes(search)).map(msg => ({ room: x, msg })))
        .slice(-50)
        .reverse()
    : [];
  // 날짜 구분선을 넣기 위한 직전 메시지 날짜
  let previousDate = '';
  return (
    <aside
      id="chat-sidebar"
      className="chat-sidebar relative flex shrink-0 flex-col overflow-hidden bg-chat"
      aria-label="활동 채팅"
    >
      {/* 헤더: 현재 방 이름(누르면 방 목록), 메시지 검색·태그 필터·방 설정·회의록 버튼 */}
      <header className="chat-header">
        <button
          className="room-title"
          title="방 목록 열기"
          onClick={() => setOverlay(overlay === 'rooms' ? null : 'rooms')}
        >
          <strong>{r?.name || '방 선택'}</strong>
          <small>{w?.name || '활동 없음'}</small>
        </button>
        <div className="chat-header-actions">
          <IconButton
            title="메시지 검색"
            icon="search"
            onClick={() => setOverlay(overlay === 'search' ? null : 'search')}
          />
          <IconButton title="태그 필터" icon="tag" onClick={() => setOverlay(overlay === 'tags' ? null : 'tags')} />
          <IconButton title="방 설정" onClick={() => w && open({ kind: 'room-settings', workspaceId: w.id })} />
          {r && w && (
            <a
              className="icon-button"
              href={url(w, 'document', r.id)}
              title="이 방의 회의록"
              aria-label="이 방의 회의록"
            >
              <Icon name="document" />
            </a>
          )}
        </div>
      </header>
      {/* 현재 방이 있으면 메시지 목록과 입력창, 없으면 안내 */}
      {r ? (
        <>
          {/* 메시지 목록: 방별 스크롤 위치를 기억하고 맨 아래에 닿으면 읽음 기록 */}
          <div
            ref={messages}
            className="chat-messages flex-1 overflow-y-auto overscroll-contain"
            onScroll={e => {
              const el = e.currentTarget;
              positions.current[String(r.id)] = el.scrollTop;
              bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              if (bottom.current) {
                setHasNew(false);
                readLast();
              }
            }}
          >
            {/* 이전 메시지를 30개씩 더 불러오기 */}
            {r.messages.length > limit && (
              <button
                className="button quiet small"
                onClick={() => {
                  const el = messages.current!;
                  older.current = { top: el.scrollTop, height: el.scrollHeight };
                  setLimits(old => ({ ...old, [r.id]: limit + 30 }));
                }}
              >
                이전 메시지 불러오기
              </button>
            )}
            {/* 메시지마다 날짜가 바뀌면 구분선, 쓰기 권한이 있으면 회의록 인용 버튼 */}
            {r.messages.slice(-limit).map(msg => {
              const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(msg.createdAt)),
                boundary = day !== previousDate;
              previousDate = day;
              return (
                <div key={msg.id}>
                  {boundary && <div className="message-date">{day}</div>}
                  <article className={`message ${msg.authorId === s.userId ? 'own' : ''}`} id={`message-${msg.id}`}>
                    <div className="message-name">
                      {name(msg.authorId)}
                      <time dateTime={msg.createdAt}>{stamp(msg.createdAt)}</time>
                    </div>
                    <div className="message-text">{msg.text}</div>
                    {writable(w, s) && (
                      <IconButton
                        title="회의록으로 인용"
                        icon="document"
                        onClick={() => quote(r, `${name(msg.authorId)} · ${stamp(msg.createdAt)}\n${msg.text}`)}
                      />
                    )}
                  </article>
                </div>
              );
            })}
            {!r.messages.length && <p className="note-line">첫 메시지를 남기면 됨</p>}
          </div>
          {/* 맨 아래를 보고 있지 않을 때 끝으로 내려가는 버튼 */}
          {hasNew && (
            <button
              className="new-message button small"
              onClick={() => {
                messages.current!.scrollTop = messages.current!.scrollHeight;
                setHasNew(false);
                readLast();
              }}
            >
              새 메시지 ↓
            </button>
          )}
          {/* 입력창: 사용자·방별 초안 유지, Ctrl+Enter 전송, 쓰기 권한이 없으면 비활성 */}
          <form className="composer" onSubmit={send}>
            <textarea
              aria-label="메시지 입력"
              placeholder="메시지 입력"
              maxLength={5000}
              value={p.messageDrafts[readKey] || ''}
              disabled={!writable(w, s)}
              onChange={e => setPrefs({ messageDrafts: { ...p.messageDrafts, [readKey]: e.target.value } })}
              onKeyDown={e => {
                if (e.ctrlKey && e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-footer">
              <small>{w?.status === '보관' ? '보관 · 조회 전용' : '로컬 데모 · Ctrl+Enter 전송'}</small>
              <button className="button primary small" disabled={!writable(w, s)}>
                전송
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="chat-unavailable">
          <p>{w && w.memberIds.includes(s.userId) ? '참여 가능한 방 없음' : '미참여 활동의 대화는 공개되지 않음'}</p>
          {writable(w, s) && (
            <button className="button small" onClick={() => open({ kind: 'room', workspaceId: w!.id })}>
              방 생성
            </button>
          )}
        </div>
      )}
      {/* 방 탐색 오버레이: 방 목록·메시지 검색·태그 필터 탭 */}
      {overlay && (
        <section className="chat-overlay" aria-label="방 탐색">
          <div className="overlay-heading">
            <div className="pill-tabs">
              {(['rooms', 'search', 'tags'] as const).map((key, i) => (
                <button key={key} className={overlay === key ? 'active' : ''} onClick={() => setOverlay(key)}>
                  {['방', '검색', '태그'][i]}
                </button>
              ))}
            </div>
            <IconButton title="탐색 닫기" icon="close" onClick={() => setOverlay(null)} />
          </div>
          <div className="overlay-body">
            {/* 방 목록: 이름 검색, 정렬 설정, 방 생성, 방별 태그와 안 읽은 메시지 수 */}
            {overlay === 'rooms' && (
              <>
                <div className="toolbar-group">
                  <input
                    className="filter-input"
                    aria-label="방 검색"
                    placeholder="방 검색"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <IconButton
                    title="방 정렬"
                    icon="sort"
                    onClick={() => open({ kind: 'room-sort', workspaceId: w?.id })}
                  />
                  {writable(w, s) && (
                    <IconButton
                      title="방 생성"
                      icon="plus"
                      onClick={() => open({ kind: 'room', workspaceId: w!.id })}
                    />
                  )}
                </div>
                {filtered.map(x => (
                  <button
                    key={x.id}
                    className={`room-item ${same(x.id, rid) ? 'active' : ''}`}
                    onClick={() => selectRoom(x)}
                  >
                    <span>
                      {x.name}
                      <small>
                        {groups
                          .flatMap(g => g.tags)
                          .filter(t => x.tagIds.includes(t.id))
                          .map(t => t.name)
                          .join(' · ') || '태그 없음'}
                      </small>
                    </span>
                    {unread(x) > 0 && <span className="unread">{unread(x)}</span>}
                  </button>
                ))}
                {!filtered.length && <p className="note-line">조건에 맞는 방 없음. 검색이나 태그 조건을 해제하면 됨</p>}
              </>
            )}
            {/* 메시지 검색: 결과를 누르면 해당 방의 그 메시지로 이동 */}
            {overlay === 'search' && (
              <>
                <input
                  className="filter-input"
                  aria-label="메시지 검색어"
                  placeholder="메시지 검색어"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {found.map(({ room: x, msg }) => (
                  <button key={msg.id} className="search-result" onClick={() => selectRoom(x, msg.id)}>
                    <small>
                      {x.name} · {stamp(msg.createdAt)}
                    </small>
                    <span>{msg.text.slice(0, 160)}</span>
                  </button>
                ))}
                {!found.length && (
                  <p className="note-line">{search ? '일치하는 메시지 없음' : '현재 활동의 참여 방에서 검색함'}</p>
                )}
              </>
            )}
            {/* 태그 필터: 고른 태그를 모두 가진 방만 방 목록에 표시 */}
            {overlay === 'tags' && (
              <>
                <div className="toolbar-group">
                  <button className="button small" onClick={() => setTags([])}>
                    필터 해제
                  </button>
                  {writable(w, s) && (
                    <IconButton title="태그 그룹 관리" onClick={() => open({ kind: 'tags', workspaceId: w!.id })} />
                  )}
                </div>
                {groups.map(g => (
                  <fieldset className="tag-group" key={g.id}>
                    <legend>{g.name}</legend>
                    {g.tags.map(t => (
                      <label key={t.id}>
                        <input
                          type="checkbox"
                          checked={tags.includes(t.id)}
                          onChange={e => setTags(e.target.checked ? [...tags, t.id] : tags.filter(x => x !== t.id))}
                        />
                        {t.name}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button className="button small" onClick={() => setOverlay('rooms')}>
                  선택 조건으로 방 보기 ({tags.length})
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
