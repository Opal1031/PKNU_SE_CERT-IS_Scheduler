import { Fragment, useRef, useState } from 'react';
import type { Workspace } from '../model';
import { bookingEndMinutes, bookingStarts, dateObj, dateString, member, minutes, name, same, time, today, workspace, writable } from '../model';
import { Heading, IconButton } from '../ui';
import type { ViewProps } from '../ui';

export function Reservations({ model, session, open, activity }: ViewProps & { activity?: Workspace }) {
  const [startDate, setStartDate] = useState(today), [days, setDays] = useState(28), board = useRef<HTMLDivElement>(null);
  const dates = Array.from({ length: days }, (_, i) => { const d = dateObj(startDate); d.setDate(d.getDate() + i); return dateString(d); });
  const active = model.bookings.filter(b => b.status !== '취소'), now = minutes(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
  function jump(value: string) {
    if (!value || Number.isNaN(dateObj(value).valueOf()) || dateString(dateObj(value)) !== value) return;
    setStartDate(value);
    setDays(28);
    board.current?.scrollTo({ top: 0 });
  }
  // ponytail: 14일씩 추가하며, 긴 사용 세션에서 느려지면 행 가상화를 적용한다.
  return <>
    {!activity && <Heading title="동아리방 예약" />}
    <div className="toolbar">
      <div className="toolbar-group">
        <label className="reservation-date-picker">시작 날짜 <input type="date" aria-label="예약 시작 날짜" value={startDate} onChange={e => jump(e.target.value)} /></label>
        <button className="button quiet small" onClick={() => jump(today())}>오늘</button>
      </div>
      {(!activity || writable(activity, session)) && <IconButton title="예약 신청" icon="plus" onClick={() => open({ kind: 'booking', workspaceId: activity?.id })} />}
    </div>
    <p className="note-line">09:00~24:00 · 30분 단위 · 빈 칸은 예약 신청, 예약 구간은 상세 확인</p>
    <div ref={board} className="reservation-board-wrap" role="region" aria-label="날짜별 예약 시간표" tabIndex={0} onScroll={e => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) setDays(count => count + 14); }}>
      <div className="reservation-board">
        <div className="reservation-time-row">
          <div className="reservation-head reservation-corner">날짜</div>
          {Array.from({ length: 15 }, (_, i) => <div className="reservation-head time-label" key={i}>
            {String(9 + i).padStart(2, '0')}
            {i === 14 && <span className="time-end">24</span>}
          </div>)}
        </div>
        {dates.map((d, index) => <Fragment key={d}>
          {(index === 0 || d.slice(0, 7) !== dates[index - 1].slice(0, 7)) && <div className="reservation-month-divider" role="separator" aria-label={`${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월`}>
            <span>{d.slice(0, 4)}년 {Number(d.slice(5, 7))}월</span>
          </div>}
          <div className={`reservation-day-row ${d === today() ? 'today' : ''}`} data-date={d} key={d}>
            <div className="reservation-date" title={d}>
              <strong>{Number(d.slice(8))}({['일', '월', '화', '수', '목', '금', '토'][dateObj(d).getDay()]})</strong>
            </div>
            {bookingStarts.map(start => {
              const minute = minutes(start), b = active.find(b => b.date === d && minutes(b.start) <= minute && bookingEndMinutes(b.end) > minute);
              // 예약 시작 칸에서 전체 구간을 그리므로 이어지는 칸은 중복 생성하지 않는다.
              if (b && minutes(b.start) !== minute) return null;
              const full = b && (member(workspace(model, b.workspaceId), session.userId) || session.officer), title = b ? `${d} ${b.start}~${b.end} · ${name(b.ownerId)}${full ? ` · ${workspace(model, b.workspaceId)?.name}` : ''}` : `${d} ${time(minute)}~${time(minute + 30)} 예약 신청`;
              return <button key={minute} data-start={time(minute)} className={`booking-slot ${minute % 60 === 0 ? 'hour-start' : ''} ${b ? 'occupied' : ''} ${b && member(workspace(model, b.workspaceId), session.userId) ? 'mine' : ''}`} style={b ? { gridColumn: `span ${(bookingEndMinutes(b.end) - minute) / 30}` } : undefined} title={title} aria-label={title} disabled={!b && (d < today() || d === today() && minute <= now || !!activity && !writable(activity, session))} onClick={() => open(b ? { kind: 'booking-info', id: b.id } : { kind: 'booking', workspaceId: activity?.id, date: d, start: time(minute) })}>{b && name(b.ownerId)}</button>;
            })}
          </div>
        </Fragment>)}
      </div>
      <button className="reservation-more button quiet small" onClick={() => setDays(count => count + 14)}>다음 14일 보기</button>
    </div>
    <section className="reservation-aside">
      <h3>{activity ? '이 활동 예약' : '내 활동 예약'} · 취소 기록 포함</h3>
      <div className="booking-list">{model.bookings.filter(b => activity ? same(b.workspaceId, activity.id) : member(workspace(model, b.workspaceId), session.userId) || session.officer).sort((a, b) => a.date.localeCompare(b.date)).map(b => <button className="event-row" key={b.id} onClick={() => open({ kind: 'booking-info', id: b.id })}>
        <strong>{b.purpose || workspace(model, b.workspaceId)?.name} · {b.status}</strong>
        <span>{b.date} {b.start}~{b.end} · {name(b.ownerId)}</span>
      </button>)}</div>
    </section>
  </>;
}
