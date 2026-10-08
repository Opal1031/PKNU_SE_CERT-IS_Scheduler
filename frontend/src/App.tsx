import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import Chat from './Chat';
import { AccountWidget, GuestActivities, GuestHome, LoginPage } from './Auth';
import Dialog from './Dialog';
import DocumentPage, { DocumentMissing } from './DocumentPage';
import { Calendar, Dashboard, Reservations, Settings } from './Pages';
import Survey from './Survey';
import type { ModalState, Room } from './model';
import { canView, getDraft, getSnapshot, iso, loadPreferences, loadWarning, member, role, room, same, setDraft, subscribe, UI_STORE, uid, url, workspace, writeLocal } from './model';
import type { Preferences } from './model';
import { Empty, Heading, Icon, IconButton } from './ui';

function parse(hash: string) {
  const [path, query] = hash.replace(/^#\/?/, '').split('?'), parts = (path || 'dashboard').split('/');
  return { workspaceId: parts[0] === 'workspace' ? parts[1] : undefined, page: parts[0] === 'workspace' ? parts[2] === 'chat' ? 'calendar' : parts[2] || 'calendar' : parts[0], roomId: new URLSearchParams(query).get('room') || parts[3], legacyChat: parts[2] === 'chat' };
}
// ponytail: tab-scoped demo state only; replace with a server-verified session when authentication is connected.
const DEMO_SESSION = 'cert-is-demo-session-v1';
export default function App() {
  const model = useSyncExternalStore(subscribe, getSnapshot);
  const [prefs, updatePrefs] = useState(loadPreferences), [hash, setHash] = useState(() => location.hash || prefs.lastHash);
  const [loggedIn, setLoggedIn] = useState(() => { try { return sessionStorage.getItem(DEMO_SESSION) === 'active'; } catch { return false; } });
  const [modal, open] = useState<ModalState | null>(null), [toast, setToast] = useState(''), [quoteSignal, quoted] = useState(0);
  const main = useRef<HTMLElement>(null), lastWorkspace = useRef<string | undefined>(undefined), timer = useRef<number | undefined>(undefined), dragging = useRef<{ x: number; width: number } | null>(null);
  const setPrefs = useCallback((patch: Partial<Preferences>) => updatePrefs(old => ({ ...old, ...patch })), []);
  const notify = useCallback((message: string) => { setToast(message); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(''), 3500); }, []);
  const session = { userId: prefs.userId, officer: prefs.officer }, route = parse(hash), w = workspace(model, route.workspaceId);
  const chatActivity = loggedIn && w && member(w, session.userId) ? w : undefined;
  const docs = w ? model.rooms.filter(r => same(r.workspaceId, w.id)) : [];
  const doc = route.roomId ? docs.find(r => same(r.id, route.roomId)) : docs.find(r => same(r.id, prefs.chatRooms[String(w?.id)])) || docs.at(-1);
  useEffect(() => {
    if (!location.hash) location.hash = loggedIn ? prefs.lastHash : '#/dashboard';
    const navigate = () => setHash(location.hash);
    window.addEventListener('hashchange', navigate);
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') open(null); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('hashchange', navigate); window.removeEventListener('keydown', escape); clearTimeout(timer.current); };
  }, []);
  useEffect(() => { try { writeLocal(UI_STORE, prefs); } catch (error) { notify((error as Error).message); } }, [prefs, notify]);
  useEffect(() => {
    open(null); main.current?.scrollTo(0, 0);
    if (!loggedIn || route.page === 'login') return;
    if (w && canView(w, session) && !same(lastWorkspace.current, w.id)) setPrefs({ chatWorkspaceId: w.id });
    if (route.legacyChat && route.roomId && room(model, route.roomId)?.memberIds.includes(session.userId)) setPrefs({ chatRooms: { ...prefs.chatRooms, [String(w?.id)]: route.roomId } });
    lastWorkspace.current = route.workspaceId; setPrefs({ lastHash: hash });
  }, [hash, loggedIn]);
  useEffect(() => { if (chatActivity && !same(chatActivity.id, prefs.chatWorkspaceId)) setPrefs({ chatWorkspaceId: chatActivity.id }); }, [chatActivity?.id, prefs.chatWorkspaceId, setPrefs]);
  useEffect(() => {
    if (loggedIn && route.page === 'document' && !route.roomId && doc && w && canView(w, session)) {
      const next = url(w, 'document', doc.id); history.replaceState(null, '', next); setHash(next);
    }
  }, [hash, doc?.id, w?.id, loggedIn]);
  useEffect(() => { if (loggedIn && route.page === 'login') location.hash = '#/dashboard'; }, [loggedIn, route.page]);
  function login(userId: string) {
    if (!uid(userId)) { notify('데모 사용자를 선택해주세요.'); return; }
    try { sessionStorage.setItem(DEMO_SESSION, 'active'); }
    catch { notify('브라우저 세션을 저장할 수 없어요. 저장 설정을 확인해주세요.'); return; }
    setPrefs({ userId, officer: false, scope: 'mine' });
    setLoggedIn(true); open(null); location.hash = '#/dashboard'; notify('데모 로그인 상태로 전환했어요.');
  }
  function logout() {
    try { sessionStorage.removeItem(DEMO_SESSION); }
    catch { notify('로그아웃 상태를 저장할 수 없어요. 저장 설정을 확인해주세요.'); return; }
    setLoggedIn(false); open(null); lastWorkspace.current = undefined;
    setPrefs({ officer: false }); location.hash = '#/dashboard'; notify('로그아웃했어요.');
  }
  const common = { model, session, prefs, setPrefs, open: (state: ModalState) => open(state), notify };
  function quote(r: Room, text: string) {
    try { const draft = getDraft(session.userId, r.id); setDraft(session.userId, r.id, { body: `${draft?.body ?? model.documents[r.id]}\n\n## 대화 인용\n${text}\n`, baseVersion: draft?.baseVersion ?? model.documentMeta[r.id].version, at: iso() }); quoted(n => n + 1); location.hash = url(workspace(model, r.workspaceId)!, 'document', r.id); notify('회의록 초안에 인용 추가됨'); } catch (error) { notify((error as Error).message); }
  }
  function completed(state: ModalState, result?: string | number) {
    open(null);
    if (state.kind === 'workspace-new' && result) location.hash = url(workspace(getSnapshot(), result)!);
    if (state.kind === 'leave' || state.kind === 'reset') location.hash = '#/dashboard';
    if (state.kind === 'reset') { setPrefs({ chatWorkspaceId: 1, chatRooms: {}, reads: {}, messageDrafts: {} }); quoted(n => n + 1); }
    if (['group-new', 'group-rename', 'tag-new', 'tag-rename', 'group-delete', 'tag-delete'].includes(state.kind)) open({ kind: 'tags', workspaceId: state.workspaceId });
  }
  const styles = { '--chat': `${chatActivity ? prefs.chatWidth : 0}px` } as CSSProperties;
  const globalTitle = { dashboard: '홈', activities: '활동 목록', login: '로그인', calendar: '개인 캘린더', reservation: '동아리방 예약', ai: 'AI 설문', settings: '설정' }[route.page] || '활동';
  return <><a className="skip-link" href="#main" onClick={e => { e.preventDefault(); main.current?.focus(); }}>본문으로 이동</a><div className={`app flex h-dvh overflow-x-auto overflow-y-hidden ${prefs.collapsed ? 'collapsed' : ''} ${!loggedIn ? 'guest' : ''}`} id="app" style={styles}>
    <aside id="global-sidebar" className="global-sidebar flex shrink-0 flex-col overflow-y-auto overscroll-contain bg-nav" aria-label="전체 탐색"><a className="brand" href="#/dashboard" aria-label="CERT-IS 홈" title="홈으로 이동" aria-current={!route.workspaceId && route.page === 'dashboard' ? 'page' : undefined}><img className="brand-logo" src={new URL('../../assets/icon/cert_is_logo.png', import.meta.url).href} width="32" height="32" alt="" /><span className="brand-name">CERT-IS</span></a>{loggedIn && <nav aria-label="기본 메뉴">{([['calendar', '달력', 'calendar'], ['reservation', '예약', 'reservation'], ['ai', 'AI 설문', 'ai']] as const).map(([page, label, icon]) => <a key={page} className={`nav-item ${!route.workspaceId && route.page === page ? 'active' : ''}`} href={`#/${page}`} title={label} aria-label={label} aria-current={!route.workspaceId && route.page === page ? 'page' : undefined}><Icon name={icon} /><span className="nav-text">{label}</span></a>)}</nav>}{!loggedIn && <><a className={`nav-item ${route.page === 'activities' ? 'active' : ''}`} href="#/activities" title="활동 목록" aria-label="활동 목록" aria-current={route.page === 'activities' ? 'page' : undefined}><Icon name="waffle" /><span className="nav-text">활동 목록</span></a><a className={`nav-item ${route.page === 'login' ? 'active' : ''}`} href="#/login" aria-current={route.page === 'login' ? 'page' : undefined} aria-label="로그인"><Icon name="user" /><span className="nav-text">로그인</span></a></>}{loggedIn && <><div className="nav-divider" role="separator" aria-label="활동 메뉴 구분">{Array.from({ length: 2 }, (_, i) => <span key={i} />)}</div><button id="workspace-launcher" className={`nav-item ${route.workspaceId || modal?.kind === 'workspace-pick' ? 'active' : ''}`} title="프로젝트 및 스터디" aria-label="프로젝트 및 스터디" aria-haspopup="dialog" aria-expanded={modal?.kind === 'workspace-pick'} onClick={() => open({ kind: 'workspace-pick' })}><Icon name="waffle" /><span className="nav-text">프로젝트 및 스터디</span></button><button className="nav-item" title="프로젝트 및 스터디 생성" aria-label="프로젝트 및 스터디 생성" aria-haspopup="dialog" onClick={() => open({ kind: 'workspace-new' })}><Icon name="plus" /><span className="nav-text">활동 생성</span></button></>}<div className="nav-bottom">{loggedIn && <a className={`nav-item ${route.page === 'settings' ? 'active' : ''}`} title="설정" aria-label="설정" aria-current={route.page === 'settings' ? 'page' : undefined} href="#/settings"><Icon name="settings" /><span className="nav-text">설정</span></a>}<button className="nav-item" title="사이드바 접기 / 펼치기" aria-label="사이드바 접기 / 펼치기" aria-expanded={!prefs.collapsed} onClick={() => setPrefs({ collapsed: !prefs.collapsed })}><Icon name={prefs.collapsed ? 'right' : 'left'} /><span className="nav-text">접기</span></button></div></aside>
    <div className={`workspace-shell flex flex-1 flex-col ${chatActivity ? 'min-w-[590px]' : 'min-w-0'}`}><header className="topbar"><div className="breadcrumb"><strong>CERT-IS</strong><span> / {loggedIn ? w?.name || globalTitle : !route.workspaceId && ['dashboard', 'activities'].includes(route.page) ? globalTitle : '로그인'}</span></div><nav id="global-actions" className="flex items-center gap-2" aria-label="사용자 메뉴"><AccountWidget session={loggedIn ? session : null} profile={() => open({ kind: 'profile' })} logout={logout} /></nav></header>
      <div className="content-shell flex min-h-0 flex-1 overflow-hidden">{chatActivity && <><Chat {...common} activity={chatActivity} quote={quote} /><div id="chat-resizer" role="separator" tabIndex={0} aria-label="채팅 공간 너비 조절" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={460} aria-valuenow={prefs.chatWidth} onPointerDown={e => { dragging.current = { x: e.clientX, width: prefs.chatWidth }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (dragging.current) setPrefs({ chatWidth: Math.max(240, Math.min(460, dragging.current.width + e.clientX - dragging.current.x)) }); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setPrefs({ chatWidth: Math.max(240, Math.min(460, prefs.chatWidth + (e.key === 'ArrowRight' ? 10 : -10))) }); } }} /></>}
        <main id="main" ref={main} tabIndex={-1} className={`min-w-[240px] flex-1 overflow-auto overscroll-contain bg-paper ${loggedIn && !route.workspaceId && route.page === 'ai' ? 'survey-main' : ''} ${loggedIn && !route.workspaceId && !['calendar', 'reservation', 'ai', 'settings', 'login'].includes(route.page) ? 'home-main' : ''}`}><div className="page">{loggedIn && loadWarning && <p className="form-error">{loadWarning}</p>}{!loggedIn ? route.page === 'dashboard' && !route.workspaceId ? <GuestHome /> : route.page === 'activities' && !route.workspaceId ? <GuestActivities activities={model.workspaces} /> : <LoginPage userId={prefs.userId} restricted={route.page !== 'login'} login={login} /> : route.workspaceId ? !w ? <Empty>활동을 찾을 수 없음. <a href="#/dashboard">홈으로 이동</a></Empty> : !canView(w, session) ? <Empty>활동 접근 권한 없음. <a href="#/dashboard">홈으로 이동</a></Empty> : <><Heading title={w.name}><span className={`tag ${member(w, session.userId) ? 'mine' : 'external'}`}>{role(w, session)}</span><IconButton title="활동 정보 및 구성원 관리" onClick={() => open({ kind: 'workspace-edit', workspaceId: w.id })} /></Heading><nav className="workspace-tabs">{[['calendar', '팀 캘린더'], ['document', '회의록'], ['reservation', '예약']].map(([page, text]) => <a key={page} className={route.page === page ? 'active' : ''} href={url(w, page)}>{text}</a>)}</nav>{route.page === 'document' ? doc ? <DocumentPage key={`${session.userId}:${doc.id}`} {...common} selected={doc} quoteSignal={quoteSignal} /> : <DocumentMissing workspaceId={w.id} open={common.open} /> : route.page === 'reservation' ? <Reservations {...common} activity={w} /> : <Calendar {...common} activity={w} />}</> : route.page === 'calendar' ? <Calendar {...common} /> : route.page === 'reservation' ? <Reservations {...common} /> : route.page === 'ai' ? <Survey key={session.userId} {...common} /> : route.page === 'settings' ? <Settings {...common} /> : <Dashboard {...common} logout={logout} />}</div></main>
      </div>
    </div>{loggedIn && modal && <Dialog key={`${modal.kind}:${modal.id}:${modal.workspaceId}:${modal.groupId}`} {...common} state={modal} close={() => open(null)} done={completed} />}
  </div>{toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}</>;
}
