import { useId, useRef, useState } from 'react';
import type { Session, Workspace } from './model';
import { name, users } from './model';
import { Empty, Field, Icon, Select } from './ui';

const features = [
  { icon: 'waffle', title: '함께하는 활동', text: '프로젝트와 스터디의 일정, 대화, 회의록을 한곳에서 관리해요.' },
  { icon: 'calendar', title: '내 일정 한눈에', text: '참여하는 활동의 일정을 모으고 중요한 일정은 즐겨찾기해요.' },
  { icon: 'reservation', title: '동아리방 예약', text: '사용 가능한 시간을 확인하고 활동에 필요한 공간을 예약해요.' }
] as const;

export function GuestHome() {
  return <div className="guest-home">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <span className="tag">CERT-IS · 동아리 활동 공간</span>
      <h1 id="welcome-title">함께 배우고,<br />함께 만들어가는 공간</h1>
      <p>프로젝트부터 스터디까지.<br />우리의 일정과 기록을 CERT-IS에서 이어가세요.</p>
      <div className="button-row"><a className="button primary" href="#/login">로그인하고 시작하기 <Icon name="right" /></a><a className="button" href="#/activities">진행중인 활동 따라가기 <Icon name="right" /></a></div>
      <small className="note-line">로그인하면 내 활동과 개인 일정을 확인할 수 있어요.</small>
    </section>
    <div className="welcome-features">{features.map(feature => <section key={feature.title}>
      <span className="feature-icon"><Icon name={feature.icon} /></span>
      <h2>{feature.title}</h2><p>{feature.text}</p>
    </section>)}</div>
    <section className="guest-login-widget" aria-label="로그인 안내">
      <div><h2>내 활동을 이어갈 준비가 됐나요?</h2><p>로그인 후 참여 중인 프로젝트와 스터디를 확인하세요.</p></div>
      <a className="button" href="#/login">로그인 <Icon name="right" /></a>
    </section>
  </div>;
}

export function GuestActivities({ activities }: { activities: Workspace[] }) {
  const ongoing = activities.filter(activity => activity.status === '진행 중');
  return <div className="guest-home">
    <section className="guest-activities" aria-labelledby="guest-activities-title">
      <div className="page-heading"><div><h1 id="guest-activities-title">지금 진행 중인 활동</h1><p className="note-line">관심 있는 주제를 발견하고, 로그인해서 함께할 활동을 살펴보세요.</p></div><span className="tag">{ongoing.length}개 활동</span></div>
      <div className="guest-activity-grid">{ongoing.map(activity => <a key={activity.id} className="guest-activity-card" href="#/login" aria-label={`${activity.name} · 로그인하고 살펴보기`}>
        <div className="guest-activity-meta"><span className={`workspace-initial ${activity.type}`}>{activity.initial}</span><span className="note-line">{activity.type === 'study' ? '스터디' : '프로젝트'} · {activity.field}</span><span className="tag">진행 중</span></div>
        <h3>{activity.name}</h3><p>{activity.goal || '로그인하고 활동 내용을 확인해보세요.'}</p>
        <span className="guest-activity-cta">로그인하고 살펴보기 <Icon name="right" /></span>
      </a>)}</div>
      {!ongoing.length && <Empty>지금 진행 중인 활동이 없어요. 로그인 후 새 활동을 만들어보세요.</Empty>}
    </section>
  </div>;
}

export function LoginPage({ userId, restricted, login }: { userId: string; restricted: boolean; login: (userId: string) => void }) {
  const [error, setError] = useState(''), [demoUser, setDemoUser] = useState(userId);
  return <div className="login-layout">
    <section className="login-intro">
      <span className="brand-mark">CI</span><span className="tag">CERT-IS</span>
      <h2>우리의 활동이<br />하나로 이어지는 곳</h2>
      <p>함께 정한 일정, 나눈 대화, 쌓아온 기록.<br />로그인하고 내 활동을 이어가세요.</p>
      <ul>{features.map(feature => <li key={feature.title}><Icon name={feature.icon} />{feature.title}</li>)}</ul>
      <a className="button quiet small" href="#/dashboard"><Icon name="left" />홈으로 돌아가기</a>
    </section>
    <section className="login-card" aria-labelledby="login-title">
      <h1 id="login-title">로그인</h1>
      <p className="login-description">{restricted ? '이 화면은 로그인 후 이용할 수 있어요.' : 'CERT-IS 계정으로 활동 공간에 들어오세요.'}</p>
      <form aria-label="계정 로그인" onSubmit={event => {
        event.preventDefault();
        event.currentTarget.reset();
        setError('계정 인증은 서버 연결 후 사용할 수 있어요. 지금은 아래 데모 로그인으로 화면을 확인하세요.');
      }}>
        <Field label="아이디" name="username" autoComplete="username" placeholder="아이디를 입력하세요" required maxLength={100} />
        <Field label="비밀번호" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력하세요" required maxLength={128} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary" type="submit">로그인 <Icon name="right" /></button>
      </form>
      <div className="login-help"><p>계정 발급 및 비밀번호 문의는 동아리 운영진에게 연락해주세요.</p></div>
      <section className="demo-login" aria-labelledby="demo-title">
        <h2 id="demo-title">화면 미리보기</h2>
        <p>인증 서버 연결 전 데모예요. 샘플 사용자로 로그인 상태와 활동 화면을 확인할 수 있어요.</p>
        <Select label="데모 사용자" items={users.map(user => [user.id, user.name])} value={demoUser} onChange={event => setDemoUser(event.target.value)} />
        <button className="button" type="button" onClick={() => login(demoUser)}>데모 로그인</button>
      </section>
    </section>
  </div>;
}

export function AccountWidget({ session, profile, logout }: { session: Session | null; profile: () => void; logout: () => void }) {
  const id = useId(), panel = useRef<HTMLDivElement>(null);
  if (!session) return <a className="button small" href="#/login"><Icon name="user" />로그인</a>;
  const role = session.officer ? '임원진' : '일반 부원';
  return <>
    <button className="account-trigger" popoverTarget={id} aria-label={`${name(session.userId)} · ${role} · 사용자 메뉴`}>
      <span className="account-avatar"><Icon name="user" /></span><span className="account-name">{name(session.userId)}</span><Icon name="down" />
    </button>
    <div id={id} ref={panel} popover="auto" className="account-panel" aria-label="내 계정">
      <div className="account-summary"><strong>{name(session.userId)}</strong><span>{role}</span><small>데모 로그인 상태</small></div>
      <a href="#/settings" onClick={() => panel.current?.hidePopover()}><Icon name="settings" />설정</a>
      <button type="button" onClick={() => { panel.current?.hidePopover(); profile(); }}><Icon name="user" />사용자 미리보기</button>
      <button type="button" className="account-logout" onClick={() => { panel.current?.hidePopover(); logout(); }}><Icon name="right" />로그아웃</button>
    </div>
  </>;
}
