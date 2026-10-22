// 로그인 후 홈 화면. 전체 활동 목록(검색·필터·참가 신청)과 내 요약·D-day 패널로 이루어진다.
import { useState } from 'react';
import { canView, dashboardDeadlines, member, name, url } from '../model';
import { Empty, Icon, IconButton } from '../ui';
import type { ViewProps } from '../ui';

/** 홈 대시보드. 활동을 찾아 참가 신청하고, 내 참여 현황과 가까운 마감(D-day)을 확인한다. */
export function Dashboard({ model, session, prefs, setPrefs, open, logout }: ViewProps & { logout: () => void }) {
  // 검색어, '참여 중' 탭 선택 여부, D-day 목록의 활동 필터
  const [query, setQuery] = useState(''),
    [mine, setMine] = useState(false),
    [deadlineActivity, setDeadlineActivity] = useState('all');
  const joined = model.workspaces.filter(activity => member(activity, session.userId));
  // 활동 목록: 검색어·탭과 필터 모달에서 고른 조건(prefs.list*)으로 거르고 정렬한다.
  const search = query.trim().toLocaleLowerCase();
  const list = model.workspaces
    .filter(
      activity =>
        (!mine || member(activity, session.userId)) &&
        activity.name.toLocaleLowerCase().includes(search) &&
        (prefs.listType === 'all' || activity.type === prefs.listType) &&
        (prefs.listField === 'all' || activity.field === prefs.listField) &&
        (prefs.listOwner === 'all' || activity.leaderId === prefs.listOwner) &&
        (prefs.listStatus === 'all' ||
          (prefs.listStatus === 'active'
            ? !['완료', '보관'].includes(activity.status)
            : activity.status === prefs.listStatus))
    )
    .sort((a, b) => {
      if (prefs.listOrder === 'name') return a.name.localeCompare(b.name, 'ko');
      // 기한이 없는 활동은 마감일 순서의 마지막에 표시한다.
      if (prefs.listOrder === 'deadline') return (a.endDate || '9999').localeCompare(b.endDate || '9999');
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  // D-day: 활동 마감과 일정 마감을 모은 뒤 선택한 활동으로 거른다('club'은 동아리 전체 일정).
  const deadlines = dashboardDeadlines(model, session),
    filtered = deadlines.filter(
      d => deadlineActivity === 'all' || String(d.workspaceId ?? 'club') === deadlineActivity
    );
  return (
    <div className="home-dashboard">
      {/* 전체 활동 패널 */}
      <section className="home-panel home-activities" aria-label="전체 활동">
        <header className="home-panel-heading">
          <div>
            <span className="home-eyebrow">PROJECTS & STUDIES</span>
            <h1>활동</h1>
            <p className="note-line">함께할 활동을 찾아보고 참여하세요.</p>
          </div>
          <IconButton title="활동 생성" icon="plus" onClick={() => open({ kind: 'workspace-new' })} />
        </header>
        {/* 검색, 필터·정렬 모달, 검색어·탭·필터 초기화 */}
        <div className="home-activity-tools">
          <input
            className="filter-input"
            type="search"
            placeholder="활동 검색"
            aria-label="활동 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <IconButton title="필터 및 정렬" icon="filter" onClick={() => open({ kind: 'list-filters' })} />
          <button
            className="button quiet small"
            onClick={() => {
              setQuery('');
              setMine(false);
              setPrefs({
                listType: 'all',
                listField: 'all',
                listStatus: 'active',
                listOwner: 'all',
                listOrder: 'recent'
              });
            }}
          >
            초기화
          </button>
        </div>
        {/* 전체/참여 중 탭과 결과 수 */}
        <div className="home-list-summary">
          <div className="pill-tabs">
            <button className={!mine ? 'active' : ''} aria-pressed={!mine} onClick={() => setMine(false)}>
              전체 활동
            </button>
            <button className={mine ? 'active' : ''} aria-pressed={mine} onClick={() => setMine(true)}>
              참여 중
            </button>
          </div>
          <span className="note-line">{list.length}개 활동</span>
        </div>
        <div className="home-activity-scroll" role="region" aria-label="활동 목록" tabIndex={0}>
          <table className="data-table home-activity-table">
            <thead>
              <tr>
                {['활동명', '팀장', '상태'].map(t => (
                  <th key={t} scope="col">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(activity => {
                // 참여 중이면 활동 열기, 아니면 참가 신청(신청 대기·종료된 활동은 비활성)
                const participating = member(activity, session.userId),
                  pending = activity.applicantIds?.includes(session.userId),
                  closed = ['완료', '보관'].includes(activity.status);
                return (
                  <tr key={activity.id}>
                    <td>
                      <button
                        className="workspace-name-cell home-activity-name"
                        onClick={() => open({ kind: 'workspace-info', workspaceId: activity.id })}
                      >
                        <span className={`workspace-initial ${activity.type}`}>{activity.initial}</span>
                        <span>
                          <strong>{activity.name}</strong>
                          <small>
                            {activity.type === 'study' ? '스터디' : '프로젝트'} · {activity.field} ·{' '}
                            {activity.memberIds.length}명
                          </small>
                          <span className={`tag ${participating ? 'mine' : 'external'}`}>
                            {participating ? '참여 중' : pending ? '신청 대기' : '미참여'}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td>{name(activity.leaderId)}</td>
                    <td>
                      <span className="home-status">{activity.status}</span>
                      {participating ? (
                        <a className="button quiet small" href={url(activity)}>
                          활동 열기 <Icon name="right" />
                        </a>
                      ) : (
                        <button
                          className="button small"
                          disabled={pending || closed}
                          onClick={() => open({ kind: 'workspace-apply', workspaceId: activity.id })}
                        >
                          {pending ? '신청 대기' : closed ? '신청 마감' : '참가 신청'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && (
            <Empty>
              조건에 맞는 활동이 없습니다.
              <br />
              검색어나 필터를 변경해주세요.
            </Empty>
          )}
        </div>
      </section>
      <aside className="home-side" aria-label="나의 활동 요약">
        {/* 내 프로필: 이름·역할, 참여 프로젝트·스터디 수, 캘린더·예약 바로가기 */}
        <section className="home-panel home-profile" aria-labelledby="home-profile-title">
          <div className="home-profile-main">
            <span className="home-profile-avatar">
              <Icon name="user" />
            </span>
            <div className="home-profile-info">
              <h2 id="home-profile-title">
                {name(session.userId)}
                <span>님</span>
              </h2>
              <p>{session.officer ? '동아리 임원진' : 'CERT-IS 부원'}</p>
              <a href="#/settings" className="note-line">
                내 정보 관리 <Icon name="right" />
              </a>
            </div>
            <button className="button quiet small" onClick={logout}>
              로그아웃
            </button>
          </div>
          <div className="home-profile-stats">
            <div>
              <strong>{joined.filter(activity => activity.type === 'project').length}</strong>
              <span>참여 프로젝트</span>
            </div>
            <div>
              <strong>{joined.filter(activity => activity.type === 'study').length}</strong>
              <span>참여 스터디</span>
            </div>
            <div>
              <strong>{deadlines.length}</strong>
              <span>남은 일정·마감</span>
            </div>
          </div>
          <div className="home-profile-links">
            <a href="#/calendar">
              <Icon name="calendar" />내 캘린더
            </a>
            <a href="#/reservation">
              <Icon name="reservation" />
              동아리방 예약
            </a>
          </div>
        </section>
        {/* D-day 목록: 누르면 일정 상세(활동 마감이면 활동 정보)를 연다. */}
        <section className="home-panel home-deadlines" aria-labelledby="home-deadline-title">
          <header className="home-panel-heading">
            <div>
              <span className="home-eyebrow">UPCOMING</span>
              <h2 id="home-deadline-title">D-day</h2>
            </div>
            <span className="note-line">가까운 마감부터</span>
          </header>
          <div className="home-deadline-filter">
            <label htmlFor="deadline-activity">활동</label>
            <select id="deadline-activity" value={deadlineActivity} onChange={e => setDeadlineActivity(e.target.value)}>
              <option value="all">전체 활동</option>
              <option value="club">동아리 전체</option>
              {model.workspaces
                .filter(activity => canView(activity, session))
                .map(activity => (
                  <option key={activity.id} value={String(activity.id)}>
                    {activity.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="home-deadline-scroll" role="region" aria-label="D-day 목록" tabIndex={0}>
            {filtered.map(d => (
              <button
                className="home-deadline"
                key={d.key}
                onClick={() =>
                  open(
                    d.eventId !== undefined
                      ? { kind: 'event', id: d.eventId, workspaceId: d.workspaceId ?? undefined }
                      : { kind: 'workspace-info', workspaceId: d.workspaceId! }
                  )
                }
              >
                {/* 3일 이내(지난 마감 포함)는 강조, 지난 마감은 D+n으로 표시 */}
                <span className={`home-dday ${d.days <= 3 ? 'urgent' : ''}`}>
                  {d.days === 0 ? 'D-day' : d.days < 0 ? `D+${Math.abs(d.days)}` : `D-${d.days}`}
                </span>
                <span className="home-deadline-detail">
                  <small>{d.activity}</small>
                  <strong>{d.title}</strong>
                  <span>
                    {d.date}
                    {d.days < 0 ? ' · 기한 지남' : ''}
                  </span>
                </span>
                <Icon name="right" />
              </button>
            ))}
            {!filtered.length && <Empty>예정된 일정이나 마감이 없습니다.</Empty>}
          </div>
        </section>
      </aside>
    </div>
  );
}
