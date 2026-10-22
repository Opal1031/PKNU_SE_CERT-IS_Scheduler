// 앱 최상위 컴포넌트. 해시 주소 라우팅, 서버 로그인·세션 만료 처리, 화면 설정 저장과
// 공통 레이아웃(사이드바·상단바·채팅 패널·본문·대화상자·알림)을 맡는다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Chat from './Chat';
import { AccountWidget, GuestActivities, GuestHome, LoginPage, SignupPage } from './Auth';
import Dialog from './Dialog';
import DocumentPage, { DocumentMissing } from './DocumentPage';
import { Calendar } from './pages/Calendar';
import { Dashboard } from './pages/Dashboard';
import { Reservations } from './pages/Reservations';
import { Settings } from './pages/Settings';
import Survey from './Survey';
import {
  expireSession,
  fetchMe,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  SESSION_EXPIRED,
  signup as apiSignup,
  tokenExpiresAt
} from './api';
import type { ApiError, ApiUser } from './api';
import type { ModalState, Room } from './model';
import {
  canView,
  getDraft,
  getSnapshot,
  iso,
  loadPreferences,
  loadWarning,
  localUserId,
  member,
  role,
  room,
  same,
  setDraft,
  subscribe,
  UI_STORE,
  url,
  workspace,
  writeLocal
} from './model';
import type { Preferences } from './model';
import { Empty, Heading, Icon, IconButton } from './ui';

// 해시 주소(#/workspace/{id}/{page}?room={id} 또는 #/{page})를 활동 ID·페이지·방 ID로 나눈다.
function parse(hash: string) {
  // 이전 채팅 주소도 팀 캘린더로 열고 방 선택은 별도로 복원한다.
  const [path, query] = hash.replace(/^#\/?/, '').split('?'),
    parts = (path || 'dashboard').split('/');
  return {
    workspaceId: parts[0] === 'workspace' ? parts[1] : undefined,
    page: parts[0] === 'workspace' ? (parts[2] === 'chat' ? 'calendar' : parts[2] || 'calendar') : parts[0],
    roomId: new URLSearchParams(query).get('room') || parts[3],
    legacyChat: parts[2] === 'chat'
  };
}
/** 루트 컴포넌트. 현재 주소와 로그인 상태에 맞는 페이지를 공통 레이아웃 안에 그린다. */
export default function App() {
  // 공유 자료(model), 화면 설정, 현재 해시 주소
  const model = useSyncExternalStore(subscribe, getSnapshot);
  const [prefs, updatePrefs] = useState(loadPreferences),
    [hash, setHash] = useState(() => location.hash || prefs.lastHash);
  // 저장된 토큰이 있으면 서버 확인(/api/auth/me)이 끝날 때까지 로그인 여부를 정하지 않는다.
  const [loggedIn, setLoggedIn] = useState(false),
    [checking, setChecking] = useState(() => !!getToken());
  // 로그인한 서버 계정 정보(로그아웃 상태면 null)
  const [account, setAccount] = useState<ApiUser | null>(null);
  // 열린 대화상자, 알림 문구, 회의록 인용 신호(바뀌면 회의록 화면이 초안을 다시 읽음)
  const [modal, open] = useState<ModalState | null>(null),
    [toast, setToast] = useState(''),
    [quoteSignal, quoted] = useState(0);
  // 본문 요소, 직전 활동 ID, 알림 타이머, 채팅 너비 드래그 시작점
  const main = useRef<HTMLElement>(null),
    lastWorkspace = useRef<string | undefined>(undefined),
    timer = useRef<number | undefined>(undefined),
    dragging = useRef<{ x: number; width: number } | null>(null);
  // 화면 설정 일부 갱신, 알림을 3.5초 동안 표시
  const setPrefs = useCallback((patch: Partial<Preferences>) => updatePrefs(old => ({ ...old, ...patch })), []);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(''), 3500);
  }, []);

  // 현재 주소의 활동, 채팅 패널을 띄울 활동(로그인한 구성원일 때만), 회의록으로 열 방
  const session = { userId: prefs.userId, officer: prefs.officer },
    route = parse(hash),
    w = workspace(model, route.workspaceId);
  const chatActivity = loggedIn && w && member(w, session.userId) ? w : undefined;
  const docs = w ? model.rooms.filter(r => same(r.workspaceId, w.id)) : [];
  const doc = route.roomId
    ? docs.find(r => same(r.id, route.roomId))
    : docs.find(r => same(r.id, prefs.chatRooms[String(w?.id)])) || docs.at(-1);

  // 첫 렌더링: 주소가 비어 있으면 기본 주소로, 주소 변경·Esc(대화상자 닫기) 리스너 등록
  useEffect(() => {
    if (!location.hash) location.hash = loggedIn ? prefs.lastHash : '#/dashboard';
    const navigate = () => setHash(location.hash);
    window.addEventListener('hashchange', navigate);
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open(null);
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('keydown', escape);
      clearTimeout(timer.current);
    };
  }, []);
  // 화면 설정이 바뀔 때마다 브라우저에 저장
  useEffect(() => {
    try {
      writeLocal(UI_STORE, prefs);
    } catch (error) {
      notify((error as Error).message);
    }
  }, [prefs, notify]);
  // 페이지 이동 시: 대화상자 닫기, 맨 위로 스크롤, 채팅 활동·방 선택과 마지막 주소 기억
  useEffect(() => {
    open(null);
    main.current?.scrollTo(0, 0);
    if (!loggedIn || route.page === 'login' || route.page === 'signup') return;
    if (w && canView(w, session) && !same(lastWorkspace.current, w.id)) setPrefs({ chatWorkspaceId: w.id });
    if (route.legacyChat && route.roomId && room(model, route.roomId)?.memberIds.includes(session.userId))
      setPrefs({ chatRooms: { ...prefs.chatRooms, [String(w?.id)]: route.roomId } });
    lastWorkspace.current = route.workspaceId;
    setPrefs({ lastHash: hash });
  }, [hash, loggedIn]);
  // 보고 있는 활동이 바뀌면 채팅 패널의 활동도 맞춘다.
  useEffect(() => {
    if (chatActivity && !same(chatActivity.id, prefs.chatWorkspaceId)) setPrefs({ chatWorkspaceId: chatActivity.id });
  }, [chatActivity?.id, prefs.chatWorkspaceId, setPrefs]);
  useEffect(() => {
    if (loggedIn && route.page === 'document' && !route.roomId && doc && w && canView(w, session)) {
      // 문서 주소에 방을 고정해야 채팅방 변경이 편집 중인 문서를 바꾸지 않는다.
      const next = url(w, 'document', doc.id);
      history.replaceState(null, '', next);
      setHash(next);
    }
  }, [hash, doc?.id, w?.id, loggedIn]);
  // 로그인한 상태로 로그인·회원가입 주소에 오면 홈으로 보낸다.
  useEffect(() => {
    if (loggedIn && (route.page === 'login' || route.page === 'signup')) location.hash = '#/dashboard';
  }, [loggedIn, route.page]);

  // 로그인 상태 복원과 세션 만료 처리
  useEffect(() => {
    if (!checking) return;
    // 새로고침 후에도 서버가 토큰을 인정할 때만 로그인 상태를 복원한다. 역할도 서버 값으로 다시 맞춘다.
    // 401(만료·비활성)은 아래 세션 만료 처리가 안내하므로 그 밖의 오류(서버 연결 실패 등)만 알린다.
    fetchMe()
      .then(enter)
      .catch((error: ApiError) => {
        apiLogout();
        if (error.status !== 401) notify(error.message);
      })
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    // 서버가 토큰을 거절하면(만료·위조·계정 비활성화) 화면도 로그아웃 상태로 돌린다.
    const expired = () => {
      setAccount(null);
      setLoggedIn(false);
      open(null);
      lastWorkspace.current = undefined;
      setPrefs({ officer: false });
      location.hash = '#/login';
      notify('로그인이 만료됐어요. 다시 로그인해주세요.');
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, [notify, setPrefs]);
  useEffect(() => {
    // 토큰 유효 시간(12시간)이 지나면 서버에 요청하지 않아도 로그아웃한다.
    const expiresAt = account && tokenExpiresAt(getToken());
    if (!expiresAt) return;
    const timeout = window.setTimeout(expireSession, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [account]);

  // 서버 계정으로 로그인 상태를 만들고 로컬 사용자 ID·임원진 여부를 설정에 반영
  function enter(user: ApiUser) {
    setAccount(user);
    setPrefs({ userId: localUserId(user), officer: user.officer, scope: 'mine' });
    setLoggedIn(true);
  }
  // 임원진이 자기 계정 정보를 바꾸면 서버 값으로 다시 맞춘다.
  const refreshAccount = () => {
    fetchMe()
      .then(enter)
      .catch((error: ApiError) => {
        if (error.status !== 401) notify(error.message);
      });
  };
  // 로그인 폼 제출: 서버 로그인 후 홈으로 이동
  async function signIn(username: string, password: string) {
    const user = await apiLogin(username, password);
    enter(user);
    open(null);
    location.hash = '#/dashboard';
    notify(`${user.name}님, 환영해요.`);
  }
  // 가입 신청은 승인 대기 계정을 만들 뿐이라 로그인 상태는 바뀌지 않는다.
  async function signUp(input: { username: string; name: string; password: string }) {
    await apiSignup(input);
  }
  // 로그아웃: 토큰을 지우고 로그인 관련 화면 상태를 비운 뒤 홈으로
  function logout() {
    apiLogout();
    setAccount(null);
    setLoggedIn(false);
    open(null);
    lastWorkspace.current = undefined;
    setPrefs({ officer: false });
    location.hash = '#/dashboard';
    notify('로그아웃했어요.');
  }

  // 페이지·채팅·대화상자에 공통으로 넘기는 props
  const common = { model, session, prefs, setPrefs, open: (state: ModalState) => open(state), notify };
  // 채팅 내용을 회의록 초안 끝에 '대화 인용'으로 붙이고 회의록 화면으로 이동
  function quote(r: Room, text: string) {
    try {
      const draft = getDraft(session.userId, r.id);
      setDraft(session.userId, r.id, {
        body: `${draft?.body ?? model.documents[r.id]}\n\n## 대화 인용\n${text}\n`,
        baseVersion: draft?.baseVersion ?? model.documentMeta[r.id].version,
        at: iso()
      });
      quoted(n => n + 1);
      location.hash = url(workspace(model, r.workspaceId)!, 'document', r.id);
      notify('회의록 초안에 인용 추가됨');
    } catch (error) {
      notify((error as Error).message);
    }
  }
  // 대화상자 작업을 마친 뒤: 활동 생성·탈퇴·초기화는 페이지 이동, 태그 작업 후에는 태그 관리 창을 다시 연다.
  function completed(state: ModalState, result?: string | number) {
    open(null);
    if (state.kind === 'workspace-new' && result) location.hash = url(workspace(getSnapshot(), result)!);
    if (state.kind === 'leave' || state.kind === 'reset') location.hash = '#/dashboard';
    if (state.kind === 'reset') {
      setPrefs({ chatWorkspaceId: 1, chatRooms: {}, reads: {}, messageDrafts: {} });
      quoted(n => n + 1);
    }
    if (['group-new', 'group-rename', 'tag-new', 'tag-rename', 'group-delete', 'tag-delete'].includes(state.kind))
      open({ kind: 'tags', workspaceId: state.workspaceId });
  }

  // 채팅 패널 너비(채팅이 없으면 0)를 CSS 변수로 넘기고, 활동 밖 페이지의 상단 제목을 정한다.
  const styles = { '--chat': `${chatActivity ? prefs.chatWidth : 0}px` } as CSSProperties;
  const globalTitle =
    {
      dashboard: '홈',
      activities: '활동 목록',
      login: '로그인',
      signup: '회원가입',
      calendar: '개인 캘린더',
      reservation: '동아리방 예약',
      ai: 'AI 설문',
      settings: '설정'
    }[route.page] || '활동';

  // 본문 페이지 선택. 로그인 확인 중이면 안내만 보여 준다.
  let page: ReactNode;
  if (checking) page = <Empty>로그인 상태를 확인하고 있어요.</Empty>;
  else if (!loggedIn) {
    // 비로그인: 홈·활동 목록·회원가입 외의 주소는 로그인 페이지로
    if (!route.workspaceId && route.page === 'dashboard') page = <GuestHome />;
    else if (!route.workspaceId && route.page === 'activities')
      page = <GuestActivities activities={model.workspaces} />;
    else if (!route.workspaceId && route.page === 'signup') page = <SignupPage signUp={signUp} />;
    else page = <LoginPage restricted={route.page !== 'login'} signIn={signIn} />;
  } else if (route.workspaceId) {
    // 활동 페이지: 활동 제목과 탭(팀 캘린더·회의록·예약), 탭별 본문. 없거나 권한이 없으면 안내
    if (!w)
      page = (
        <Empty>
          활동을 찾을 수 없음. <a href="#/dashboard">홈으로 이동</a>
        </Empty>
      );
    else if (!canView(w, session))
      page = (
        <Empty>
          활동 접근 권한 없음. <a href="#/dashboard">홈으로 이동</a>
        </Empty>
      );
    else
      page = (
        <>
          <Heading title={w.name}>
            <span className={`tag ${member(w, session.userId) ? 'mine' : 'external'}`}>{role(w, session)}</span>
            <IconButton
              title="활동 정보 및 구성원 관리"
              onClick={() => open({ kind: 'workspace-edit', workspaceId: w.id })}
            />
          </Heading>
          <nav className="workspace-tabs">
            {[
              ['calendar', '팀 캘린더'],
              ['document', '회의록'],
              ['reservation', '예약']
            ].map(([section, text]) => (
              <a key={section} className={route.page === section ? 'active' : ''} href={url(w, section)}>
                {text}
              </a>
            ))}
          </nav>
          {route.page === 'document' ? (
            doc ? (
              <DocumentPage key={`${session.userId}:${doc.id}`} {...common} selected={doc} quoteSignal={quoteSignal} />
            ) : (
              <DocumentMissing workspaceId={w.id} open={common.open} />
            )
          ) : route.page === 'reservation' ? (
            <Reservations {...common} activity={w} />
          ) : (
            <Calendar {...common} activity={w} />
          )}
        </>
      );
  } else {
    // 활동 밖 페이지: 개인 캘린더, 예약, AI 설문, 설정, 그 밖에는 홈(대시보드)
    switch (route.page) {
      case 'calendar':
        page = <Calendar {...common} />;
        break;
      case 'reservation':
        page = <Reservations {...common} />;
        break;
      case 'ai':
        page = <Survey key={session.userId} {...common} />;
        break;
      case 'settings':
        page = <Settings {...common} account={account} refreshAccount={refreshAccount} />;
        break;
      default:
        page = <Dashboard {...common} logout={logout} />;
    }
  }
  return (
    <>
      {/* 키보드 사용자를 위한 본문 바로가기 링크 */}
      <a
        className="skip-link"
        href="#main"
        onClick={e => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        본문으로 이동
      </a>
      <div
        className={`app flex h-dvh overflow-x-auto overflow-y-hidden ${prefs.collapsed ? 'collapsed' : ''} ${!loggedIn ? 'guest' : ''}`}
        id="app"
        style={styles}
      >
        {/* 왼쪽 전체 사이드바: 로고, 기본 메뉴, 활동 메뉴, 설정·접기 */}
        <aside
          id="global-sidebar"
          className="global-sidebar flex shrink-0 flex-col overflow-y-auto overscroll-contain bg-nav"
          aria-label="전체 탐색"
        >
          <a
            className="brand"
            href="#/dashboard"
            aria-label="CERT-IS 홈"
            title="홈으로 이동"
            aria-current={!route.workspaceId && route.page === 'dashboard' ? 'page' : undefined}
          >
            <img
              className="brand-logo"
              src={new URL('../../assets/icon/cert_is_logo.png', import.meta.url).href}
              width="32"
              height="32"
              alt=""
            />
            <span className="brand-name">CERT-IS</span>
          </a>
          {/* 로그인 후 기본 메뉴(달력·예약·AI 설문), 비로그인 시 활동 목록·로그인 */}
          {loggedIn && (
            <nav aria-label="기본 메뉴">
              {(
                [
                  ['calendar', '달력', 'calendar'],
                  ['reservation', '예약', 'reservation'],
                  ['ai', 'AI 설문', 'ai']
                ] as const
              ).map(([page, label, icon]) => (
                <a
                  key={page}
                  className={`nav-item ${!route.workspaceId && route.page === page ? 'active' : ''}`}
                  href={`#/${page}`}
                  title={label}
                  aria-label={label}
                  aria-current={!route.workspaceId && route.page === page ? 'page' : undefined}
                >
                  <Icon name={icon} />
                  <span className="nav-text">{label}</span>
                </a>
              ))}
            </nav>
          )}
          {!loggedIn && (
            <>
              <a
                className={`nav-item ${route.page === 'activities' ? 'active' : ''}`}
                href="#/activities"
                title="활동 목록"
                aria-label="활동 목록"
                aria-current={route.page === 'activities' ? 'page' : undefined}
              >
                <Icon name="waffle" />
                <span className="nav-text">활동 목록</span>
              </a>
              <a
                className={`nav-item ${route.page === 'login' ? 'active' : ''}`}
                href="#/login"
                aria-current={route.page === 'login' ? 'page' : undefined}
                aria-label="로그인"
              >
                <Icon name="user" />
                <span className="nav-text">로그인</span>
              </a>
            </>
          )}
          {/* 활동 선택·생성 버튼 */}
          {loggedIn && (
            <>
              <div className="nav-divider" role="separator" aria-label="활동 메뉴 구분">
                {Array.from({ length: 2 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
              <button
                id="workspace-launcher"
                className={`nav-item ${route.workspaceId || modal?.kind === 'workspace-pick' ? 'active' : ''}`}
                title="프로젝트 및 스터디"
                aria-label="프로젝트 및 스터디"
                aria-haspopup="dialog"
                aria-expanded={modal?.kind === 'workspace-pick'}
                onClick={() => open({ kind: 'workspace-pick' })}
              >
                <Icon name="waffle" />
                <span className="nav-text">프로젝트 및 스터디</span>
              </button>
              <button
                className="nav-item"
                title="프로젝트 및 스터디 생성"
                aria-label="프로젝트 및 스터디 생성"
                aria-haspopup="dialog"
                onClick={() => open({ kind: 'workspace-new' })}
              >
                <Icon name="plus" />
                <span className="nav-text">활동 생성</span>
              </button>
            </>
          )}
          <div className="nav-bottom">
            {loggedIn && (
              <a
                className={`nav-item ${route.page === 'settings' ? 'active' : ''}`}
                title="설정"
                aria-label="설정"
                aria-current={route.page === 'settings' ? 'page' : undefined}
                href="#/settings"
              >
                <Icon name="settings" />
                <span className="nav-text">설정</span>
              </a>
            )}
            <button
              className="nav-item"
              title="사이드바 접기 / 펼치기"
              aria-label="사이드바 접기 / 펼치기"
              aria-expanded={!prefs.collapsed}
              onClick={() => setPrefs({ collapsed: !prefs.collapsed })}
            >
              <Icon name={prefs.collapsed ? 'right' : 'left'} />
              <span className="nav-text">접기</span>
            </button>
          </div>
        </aside>
        {/* 오른쪽 영역: 상단바(경로·계정 메뉴), 채팅 패널, 본문 */}
        <div className={`workspace-shell flex flex-1 flex-col ${chatActivity ? 'min-w-[590px]' : 'min-w-0'}`}>
          <header className="topbar">
            <div className="breadcrumb">
              <strong>CERT-IS</strong>
              <span>
                {' '}
                /{' '}
                {loggedIn
                  ? w?.name || globalTitle
                  : !route.workspaceId && ['dashboard', 'activities', 'signup'].includes(route.page)
                    ? globalTitle
                    : '로그인'}
              </span>
            </div>
            <nav id="global-actions" className="flex items-center gap-2" aria-label="사용자 메뉴">
              <AccountWidget session={loggedIn ? session : null} logout={logout} />
            </nav>
          </header>
          <div className="content-shell flex min-h-0 flex-1 overflow-hidden">
            {/* 활동 채팅 패널과 너비 조절 핸들(드래그 또는 좌우 화살표, 240~460px) */}
            {chatActivity && (
              <>
                <Chat {...common} activity={chatActivity} quote={quote} />
                <div
                  id="chat-resizer"
                  role="separator"
                  tabIndex={0}
                  aria-label="채팅 공간 너비 조절"
                  aria-orientation="vertical"
                  aria-valuemin={240}
                  aria-valuemax={460}
                  aria-valuenow={prefs.chatWidth}
                  onPointerDown={e => {
                    dragging.current = { x: e.clientX, width: prefs.chatWidth };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={e => {
                    if (dragging.current)
                      setPrefs({
                        chatWidth: Math.max(240, Math.min(460, dragging.current.width + e.clientX - dragging.current.x))
                      });
                  }}
                  onPointerUp={() => {
                    dragging.current = null;
                  }}
                  onPointerCancel={() => {
                    dragging.current = null;
                  }}
                  onKeyDown={e => {
                    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                      e.preventDefault();
                      setPrefs({
                        chatWidth: Math.max(240, Math.min(460, prefs.chatWidth + (e.key === 'ArrowRight' ? 10 : -10)))
                      });
                    }
                  }}
                />
              </>
            )}
            {/* 본문: 자료 읽기 경고와 선택된 페이지 */}
            <main
              id="main"
              ref={main}
              tabIndex={-1}
              className={`min-w-[240px] flex-1 overflow-auto overscroll-contain bg-paper ${loggedIn && !route.workspaceId && route.page === 'ai' ? 'survey-main' : ''} ${loggedIn && !route.workspaceId && !['calendar', 'reservation', 'ai', 'settings', 'login'].includes(route.page) ? 'home-main' : ''}`}
            >
              <div className="page">
                {loggedIn && loadWarning && <p className="form-error">{loadWarning}</p>}
                {page}
              </div>
            </main>
          </div>
        </div>
        {/* 열린 대화상자(로그인 상태에서만) */}
        {loggedIn && modal && (
          <Dialog
            key={`${modal.kind}:${modal.id}:${modal.workspaceId}:${modal.groupId}`}
            {...common}
            state={modal}
            close={() => open(null)}
            done={completed}
          />
        )}
      </div>
      {/* 알림(토스트) */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}
