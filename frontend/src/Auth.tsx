import { useId, useRef, useState } from 'react';
import type { Session, Workspace } from './model';
import { USERNAME_PATTERN } from './api';
import { name } from './model';
import { Empty, Field, Icon } from './ui';

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

export function LoginPage({ restricted, signIn }: { restricted: boolean; signIn: (username: string, password: string) => Promise<void> }) {
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  return <div className="login-layout">
    <LoginIntro />
    <section className="login-card" aria-labelledby="login-title">
      <h1 id="login-title">로그인</h1>
      <p className="login-description">{restricted ? '이 화면은 로그인 후 이용할 수 있어요.' : 'CERT-IS 계정으로 활동 공간에 들어오세요.'}</p>
      <form aria-label="계정 로그인" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget, data = new FormData(form);
        setError(''); setPending(true);
        try { await signIn(String(data.get('username') || '').trim(), String(data.get('password') || '')); }
        catch (failure) {
          // 실패한 비밀번호는 화면에 남기지 않는다.
          setError((failure as Error).message);
          const password = form.elements.namedItem('password');
          if (password instanceof HTMLInputElement) password.value = '';
        }
        finally { setPending(false); }
      }}>
        <Field label="아이디" name="username" autoComplete="username" placeholder="아이디를 입력하세요" required maxLength={100} />
        <Field label="비밀번호" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력하세요" required maxLength={128} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary" type="submit" disabled={pending}>{pending ? '로그인 중' : '로그인'} <Icon name="right" /></button>
      </form>
      <div className="login-help">
        <p>아직 계정이 없나요? <a href="#/signup">회원가입</a> 후 운영진이 승인하면 로그인할 수 있어요.</p>
        <p>비밀번호 문의는 동아리 운영진에게 연락해주세요.</p>
      </div>
    </section>
  </div>;
}

function LoginIntro() {
  return <section className="login-intro">
    <span className="brand-mark">CI</span><span className="tag">CERT-IS</span>
    <h2>우리의 활동이<br />하나로 이어지는 곳</h2>
    <p>함께 정한 일정, 나눈 대화, 쌓아온 기록.<br />로그인하고 내 활동을 이어가세요.</p>
    <ul>{features.map(feature => <li key={feature.title}><Icon name={feature.icon} />{feature.title}</li>)}</ul>
    <a className="button quiet small" href="#/dashboard"><Icon name="left" />홈으로 돌아가기</a>
  </section>;
}

export function SignupPage({ signUp }: { signUp: (account: { username: string; name: string; password: string }) => Promise<void> }) {
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [done, setDone] = useState('');
  return <div className="login-layout">
    <LoginIntro />
    <section className="login-card" aria-labelledby="signup-title">
      <h1 id="signup-title">회원가입</h1>
      {done
        ? <div className="signup-done" role="status">
          <p><strong>{done}</strong> 아이디로 가입 신청을 보냈어요.</p>
          <p>운영진이 승인하면 로그인할 수 있어요. 승인이 늦어지면 운영진에게 연락해주세요.</p>
          <a className="button primary" href="#/login">로그인 화면으로 <Icon name="right" /></a>
        </div>
        : <>
          <p className="login-description">CERT-IS 부원 계정을 만들어요. 운영진 승인 후 로그인할 수 있어요.</p>
          <form aria-label="회원가입" onSubmit={async event => {
            event.preventDefault();
            const form = event.currentTarget, data = new FormData(form), text = (key: string) => String(data.get(key) || '');
            const clearPasswords = () => form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input => { input.value = ''; });
            if (text('password') !== text('confirmPassword')) { setError('비밀번호와 확인 값이 달라요.'); clearPasswords(); return; }
            setError(''); setPending(true);
            try {
              const username = text('username').trim();
              await signUp({ username, name: text('name').trim(), password: text('password') });
              setDone(username);
            } catch (failure) { setError((failure as Error).message); clearPasswords(); }
            finally { setPending(false); }
          }}>
            <Field label="아이디 (영문·숫자·_.- 3~50자)" name="username" autoComplete="username" required pattern={USERNAME_PATTERN} title="영문·숫자·_.- 3~50자" maxLength={50} />
            <Field label="이름" name="name" autoComplete="name" required maxLength={50} />
            <Field label="비밀번호 (8자 이상)" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
            <Field label="비밀번호 확인" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary" type="submit" disabled={pending}>{pending ? '가입 신청 중' : '가입 신청'} <Icon name="right" /></button>
          </form>
          <div className="login-help"><p>이미 계정이 있나요? <a href="#/login">로그인</a></p></div>
        </>}
    </section>
  </div>;
}

export function AccountWidget({ session, logout }: { session: Session | null; logout: () => void }) {
  const id = useId(), panel = useRef<HTMLDivElement>(null);
  if (!session) return <a className="button small" href="#/login"><Icon name="user" />로그인</a>;
  const role = session.officer ? '임원진' : '일반 부원';
  return <>
    <button className="account-trigger" popoverTarget={id} aria-label={`${name(session.userId)} · ${role} · 사용자 메뉴`}>
      <span className="account-avatar"><Icon name="user" /></span><span className="account-name">{name(session.userId)}</span><Icon name="down" />
    </button>
    <div id={id} ref={panel} popover="auto" className="account-panel" aria-label="내 계정">
      <div className="account-summary"><strong>{name(session.userId)}</strong><span>{role}</span><small>CERT-IS 계정</small></div>
      <a href="#/settings" onClick={() => panel.current?.hidePopover()}><Icon name="settings" />설정</a>
      <button type="button" className="account-logout" onClick={() => { panel.current?.hidePopover(); logout(); }}><Icon name="right" />로그아웃</button>
    </div>
  </>;
}
