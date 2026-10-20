import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CalendarEvent, Workspace } from '../model';
import { calendarEvents, dateObj, dateString, name, today, writable } from '../model';
import { Empty, Heading, Icon, IconButton } from '../ui';
import type { ViewProps } from '../ui';

export function EventRow({ event: e, open, pinned = false, onPin }: { event: CalendarEvent; open: ViewProps['open']; pinned?: boolean; onPin?: () => void }) {
  return <div className="event-row-with-pin" data-event-id={e.id}>
    <button className="event-row" onClick={() => open(e.bookingId !== undefined ? { kind: 'booking-info', id: e.bookingId } : { kind: 'event', id: e.id, workspaceId: e.workspaceId ?? undefined })}>
      <strong>{e.title}</strong>
      <span>{e.date} {e.start}~{e.end}{e.endDate !== e.date && ` · ${e.endDate}까지`} · {e.status}</span>
      <small>{e.assigneeIds.map(name).join(', ')} · {e.work || '담당업무 미지정'}</small>
    </button>
    {onPin && <button type="button" className={`icon-button event-pin ${pinned ? 'pinned' : ''}`} aria-pressed={pinned} aria-label={`${e.title} 즐겨찾기 ${pinned ? '해제' : '추가'}`} title={`즐겨찾기 ${pinned ? '해제' : '추가'}`} onClick={onPin}>
      <Icon name="pin" />
    </button>}
  </div>;
}
export function Calendar({ model, session, prefs, setPrefs, open, activity }: ViewProps & { activity?: Workspace }) {
  const [month, setMonth] = useState(() => new Date(`${today()}T12:00:00`).getMonth()), [year, setYear] = useState(() => Number(today().slice(0, 4))), [day, setDay] = useState(today);
  const dayDetails = useRef<HTMLElement>(null);
  function selectDay(value: string) { setDay(value); dayDetails.current?.scrollIntoView({ block: 'nearest' }); }
  // 즐겨찾기는 사용자별 개인 설정이므로 팀 캘린더의 공통 표시에 적용하지 않는다.
  const pins = !activity ? prefs.calendarPins[session.userId] || [] : [], pinned = (e: CalendarEvent) => pins.includes(String(e.id));
  const order = (a: CalendarEvent, b: CalendarEvent) => Number(pinned(b)) - Number(pinned(a)) || a.start.localeCompare(b.start);
  const events = calendarEvents(model, session, activity, activity ? prefs.calendarMine : false, prefs.calendarScope).filter(e => !!activity || !prefs.calendarMine || e.assigneeIds.includes(session.userId) || pinned(e));
  function togglePin(e: CalendarEvent) { const id = String(e.id); setPrefs({ calendarPins: { ...prefs.calendarPins, [session.userId]: pinned(e) ? pins.filter(x => x !== id) : [...pins, id] } }); }
  const eventRow = (e: CalendarEvent) => <EventRow key={e.id} event={e} open={open} pinned={pinned(e)} onPin={!activity ? () => togglePin(e) : undefined} />;
  const first = new Date(year, month, 1, 12), start = new Date(first); start.setDate(1 - (first.getDay() + 6) % 7);
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + new Date(year, month + 1, 0).getDate()) / 7);
  const changeMonth = (offset: number) => { const date = new Date(year, month + offset, 1, 12); setMonth(date.getMonth()); setYear(date.getFullYear()); setDay(dateString(date)); };
  return <div className={`calendar-view ${!activity ? 'personal-calendar' : ''}`}>
    {!activity && <Heading title="개인 캘린더" />}
    <div className="toolbar">
      <div className="month-heading">
        <IconButton title="이전 달" icon="left" onClick={() => changeMonth(-1)} />
        <h2>{year}.{String(month + 1).padStart(2, '0')}</h2>
        <IconButton title="다음 달" icon="right" onClick={() => changeMonth(1)} />
        <button className="button quiet small" onClick={() => { const date = dateObj(today()); setMonth(date.getMonth()); setYear(date.getFullYear()); setDay(today()); }}>오늘</button>
      </div>
      <div className="toolbar-group">
        <button className="button small" onClick={() => setPrefs({ calendarMode: prefs.calendarMode === 'month' ? 'list' : 'month' })}>{prefs.calendarMode === 'month' ? '목록 보기' : '월간 보기'}</button>
        <IconButton title="일정 표시 조건" icon="filter" onClick={() => open({ kind: 'calendar-filters', workspaceId: activity?.id })} />
        {(!activity || writable(activity, session)) && <IconButton title="일정 등록" icon="plus" onClick={() => open({ kind: 'event', workspaceId: activity?.id, date: day })} />}
      </div>
    </div>
    <p className="note-line">
      {prefs.calendarMine ? '내 담당 일정' : '팀 전체 일정'}
      {!activity && session.officer && prefs.calendarScope === 'all' && ' · 전체 활동 운영 조회'}
      {!activity ? ' · 날짜를 선택해 여러 일정을 핀으로 표시 · 즐겨찾기는 항상 표시' : ' · 날짜를 선택하면 전체 일정 표시'}
    </p>
    {prefs.calendarMode === 'list' ? <div className="event-list">
      {events.filter(e => e.date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`).sort((a, b) => a.date.localeCompare(b.date) || order(a, b)).map(eventRow)}
      {!events.some(e => e.date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`) && <Empty>이번 달 일정 없음</Empty>}
    </div> : <div className="calendar-layout">
      <div className="month-calendar" style={{ '--weeks': weeks } as CSSProperties}>
        {['월', '화', '수', '목', '금', '토', '일'].map(t => <div className="weekday" key={t}>{t}</div>)}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = new Date(start); d.setDate(d.getDate() + i); const value = dateString(d), list = events.filter(e => e.date <= value && e.endDate >= value).sort(order);
          // 핀한 일정은 모두 표시하고 남는 기본 표시 칸만 일반 일정에 사용한다.
          const favorites = list.filter(pinned), preview = activity ? list.slice(0, 1) : [...favorites, ...list.filter(e => !pinned(e)).slice(0, Math.max(0, 2 - favorites.length))], hidden = list.length - preview.length;
          return <div key={value} data-date={value} className={`calendar-day ${d.getMonth() !== month ? 'outside' : ''} ${value === day ? 'selected' : ''}`}>
            <div className="calendar-day-heading">
              <button aria-label={`${value} 일정 ${list.length}개`} aria-pressed={value === day} className={`day-button ${value === today() ? 'today' : ''}`} onClick={() => selectDay(value)}>{d.getDate()}</button>
              {hidden > 0 && <button className="calendar-count" aria-label={`${value} 나머지 일정 ${hidden}개 보기`} onClick={() => selectDay(value)}>+{hidden}</button>}
            </div>
            {preview.map(e => <button key={e.id} data-event-id={e.id} className={`calendar-event ${pinned(e) ? 'pinned' : ''} ${e.visibility === 'club' ? 'club' : e.assigneeIds.includes(session.userId) ? 'mine' : ''}`} title={e.title} aria-label={`${e.title}${pinned(e) ? ' · 즐겨찾기' : ''}`} onClick={() => open(e.bookingId !== undefined ? { kind: 'booking-info', id: e.bookingId } : { kind: 'event', id: e.id, workspaceId: e.workspaceId ?? undefined })}>
              {pinned(e) && <Icon name="pin" />}
              {e.title}
            </button>)}
          </div>;
        })}
      </div>
      <section ref={dayDetails} className="calendar-aside" aria-label="선택한 날짜 일정">
        <h3>{day}</h3>
        {events.filter(e => e.date <= day && e.endDate >= day).sort(order).map(eventRow)}
        {!events.some(e => e.date <= day && e.endDate >= day) && <p className="note-line">일정 없음</p>}
      </section>
    </div>}

  </div>;
}
