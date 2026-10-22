// 일정 캘린더 화면. activity 없이 쓰면 개인 캘린더(즐겨찾기 핀 사용), 넘기면 그 활동의 팀 캘린더.
// 월간 보기와 목록 보기를 지원하고, 동아리방 예약도 일정처럼 함께 표시한다.
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CalendarEvent, Workspace } from '../model';
import { calendarEvents, dateObj, dateString, name, today, writable } from '../model';
import { Empty, Heading, Icon, IconButton } from '../ui';
import type { ViewProps } from '../ui';

/** 일정 한 줄. 누르면 일정 상세(예약이면 예약 정보)를 열고, onPin이 있으면 즐겨찾기 버튼을 붙인다. */
export function EventRow({
  event: e,
  open,
  pinned = false,
  onPin
}: {
  event: CalendarEvent;
  open: ViewProps['open'];
  pinned?: boolean;
  onPin?: () => void;
}) {
  return (
    <div className="event-row-with-pin" data-event-id={e.id}>
      <button
        className="event-row"
        onClick={() =>
          open(
            e.bookingId !== undefined
              ? { kind: 'booking-info', id: e.bookingId }
              : { kind: 'event', id: e.id, workspaceId: e.workspaceId ?? undefined }
          )
        }
      >
        <strong>{e.title}</strong>
        <span>
          {e.date} {e.start}~{e.end}
          {e.endDate !== e.date && ` · ${e.endDate}까지`} · {e.status}
        </span>
        <small>
          {e.assigneeIds.map(name).join(', ')} · {e.work || '담당업무 미지정'}
        </small>
      </button>
      {onPin && (
        <button
          type="button"
          className={`icon-button event-pin ${pinned ? 'pinned' : ''}`}
          aria-pressed={pinned}
          aria-label={`${e.title} 즐겨찾기 ${pinned ? '해제' : '추가'}`}
          title={`즐겨찾기 ${pinned ? '해제' : '추가'}`}
          onClick={onPin}
        >
          <Icon name="pin" />
        </button>
      )}
    </div>
  );
}
/** 월간·목록 캘린더. activity가 있으면 팀 캘린더, 없으면 개인 캘린더로 동작한다. */
export function Calendar({ model, session, prefs, setPrefs, open, activity }: ViewProps & { activity?: Workspace }) {
  // 보고 있는 연·월(month는 0부터)과 선택한 날짜
  const [month, setMonth] = useState(() => new Date(`${today()}T12:00:00`).getMonth()),
    [year, setYear] = useState(() => Number(today().slice(0, 4))),
    [day, setDay] = useState(today);
  // 날짜를 고르면 선택한 날짜의 일정 영역이 보이도록 스크롤한다.
  const dayDetails = useRef<HTMLElement>(null);
  function selectDay(value: string) {
    setDay(value);
    dayDetails.current?.scrollIntoView({ block: 'nearest' });
  }
  // 즐겨찾기는 사용자별 개인 설정이므로 팀 캘린더의 공통 표시에 적용하지 않는다.
  const pins = !activity ? prefs.calendarPins[session.userId] || [] : [],
    pinned = (e: CalendarEvent) => pins.includes(String(e.id));
  // 같은 날 일정은 즐겨찾기 먼저, 그다음 시작 시각 순
  const order = (a: CalendarEvent, b: CalendarEvent) =>
    Number(pinned(b)) - Number(pinned(a)) || a.start.localeCompare(b.start);
  // 표시할 일정. '내 담당' 조건은 팀 캘린더면 calendarEvents에서 거르고,
  // 개인 캘린더면 여기서 거르되 즐겨찾기한 일정은 남긴다.
  const events = calendarEvents(
    model,
    session,
    activity,
    activity ? prefs.calendarMine : false,
    prefs.calendarScope
  ).filter(e => !!activity || !prefs.calendarMine || e.assigneeIds.includes(session.userId) || pinned(e));
  // 즐겨찾기 추가/해제. 사용자별로 prefs.calendarPins에 일정 ID를 저장한다.
  function togglePin(e: CalendarEvent) {
    const id = String(e.id);
    setPrefs({
      calendarPins: { ...prefs.calendarPins, [session.userId]: pinned(e) ? pins.filter(x => x !== id) : [...pins, id] }
    });
  }
  // 목록 보기·선택 날짜 영역의 일정 행(팀 캘린더에는 즐겨찾기 버튼 없음)
  const eventRow = (e: CalendarEvent) => (
    <EventRow key={e.id} event={e} open={open} pinned={pinned(e)} onPin={!activity ? () => togglePin(e) : undefined} />
  );
  // 월간 격자: 월요일 시작 기준으로 첫 칸의 날짜와 필요한 주 수를 구한다.
  const first = new Date(year, month, 1, 12),
    start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(year, month + 1, 0).getDate()) / 7);
  // 이전/다음 달로 이동하면 그 달 1일을 선택한다.
  const changeMonth = (offset: number) => {
    const date = new Date(year, month + offset, 1, 12);
    setMonth(date.getMonth());
    setYear(date.getFullYear());
    setDay(dateString(date));
  };
  return (
    <div className={`calendar-view ${!activity ? 'personal-calendar' : ''}`}>
      {!activity && <Heading title="개인 캘린더" />}
      {/* 도구 모음: 달 이동·오늘, 보기 전환·표시 조건·일정 등록 */}
      <div className="toolbar">
        <div className="month-heading">
          <IconButton title="이전 달" icon="left" onClick={() => changeMonth(-1)} />
          <h2>
            {year}.{String(month + 1).padStart(2, '0')}
          </h2>
          <IconButton title="다음 달" icon="right" onClick={() => changeMonth(1)} />
          <button
            className="button quiet small"
            onClick={() => {
              const date = dateObj(today());
              setMonth(date.getMonth());
              setYear(date.getFullYear());
              setDay(today());
            }}
          >
            오늘
          </button>
        </div>
        <div className="toolbar-group">
          <button
            className="button small"
            onClick={() => setPrefs({ calendarMode: prefs.calendarMode === 'month' ? 'list' : 'month' })}
          >
            {prefs.calendarMode === 'month' ? '목록 보기' : '월간 보기'}
          </button>
          <IconButton
            title="일정 표시 조건"
            icon="filter"
            onClick={() => open({ kind: 'calendar-filters', workspaceId: activity?.id })}
          />
          {(!activity || writable(activity, session)) && (
            <IconButton
              title="일정 등록"
              icon="plus"
              onClick={() => open({ kind: 'event', workspaceId: activity?.id, date: day })}
            />
          )}
        </div>
      </div>
      {/* 현재 표시 조건 안내 */}
      <p className="note-line">
        {prefs.calendarMine ? '내 담당 일정' : '팀 전체 일정'}
        {!activity && session.officer && prefs.calendarScope === 'all' && ' · 전체 활동 운영 조회'}
        {!activity
          ? ' · 날짜를 선택해 여러 일정을 핀으로 표시 · 즐겨찾기는 항상 표시'
          : ' · 날짜를 선택하면 전체 일정 표시'}
      </p>
      {prefs.calendarMode === 'list' ? (
        <div className="event-list">
          {/* 목록 보기: 보고 있는 달에 시작하는 일정을 날짜순으로 */}
          {events
            .filter(e => e.date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`)
            .sort((a, b) => a.date.localeCompare(b.date) || order(a, b))
            .map(eventRow)}
          {!events.some(e => e.date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`) && (
            <Empty>이번 달 일정 없음</Empty>
          )}
        </div>
      ) : (
        <div className="calendar-layout">
          {/* 월간 보기: 요일 머리글과 날짜 칸. 칸마다 일정 일부만 미리 보이고 나머지는 +n */}
          <div className="month-calendar" style={{ '--weeks': weeks } as CSSProperties}>
            {['월', '화', '수', '목', '금', '토', '일'].map(t => (
              <div className="weekday" key={t}>
                {t}
              </div>
            ))}
            {Array.from({ length: weeks * 7 }, (_, i) => {
              // i번째 칸의 날짜와 그날에 걸친 일정(여러 날 일정 포함)
              const d = new Date(start);
              d.setDate(d.getDate() + i);
              const value = dateString(d),
                list = events.filter(e => e.date <= value && e.endDate >= value).sort(order);
              // 핀한 일정은 모두 표시하고 남는 기본 표시 칸만 일반 일정에 사용한다.
              const favorites = list.filter(pinned),
                preview = activity
                  ? list.slice(0, 1)
                  : [...favorites, ...list.filter(e => !pinned(e)).slice(0, Math.max(0, 2 - favorites.length))],
                hidden = list.length - preview.length;
              return (
                <div
                  key={value}
                  data-date={value}
                  className={`calendar-day ${d.getMonth() !== month ? 'outside' : ''} ${value === day ? 'selected' : ''}`}
                >
                  <div className="calendar-day-heading">
                    <button
                      aria-label={`${value} 일정 ${list.length}개`}
                      aria-pressed={value === day}
                      className={`day-button ${value === today() ? 'today' : ''}`}
                      onClick={() => selectDay(value)}
                    >
                      {d.getDate()}
                    </button>
                    {hidden > 0 && (
                      <button
                        className="calendar-count"
                        aria-label={`${value} 나머지 일정 ${hidden}개 보기`}
                        onClick={() => selectDay(value)}
                      >
                        +{hidden}
                      </button>
                    )}
                  </div>
                  {preview.map(e => (
                    <button
                      key={e.id}
                      data-event-id={e.id}
                      className={`calendar-event ${pinned(e) ? 'pinned' : ''} ${e.visibility === 'club' ? 'club' : e.assigneeIds.includes(session.userId) ? 'mine' : ''}`}
                      title={e.title}
                      aria-label={`${e.title}${pinned(e) ? ' · 즐겨찾기' : ''}`}
                      onClick={() =>
                        open(
                          e.bookingId !== undefined
                            ? { kind: 'booking-info', id: e.bookingId }
                            : { kind: 'event', id: e.id, workspaceId: e.workspaceId ?? undefined }
                        )
                      }
                    >
                      {pinned(e) && <Icon name="pin" />}
                      {e.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          {/* 선택한 날짜의 전체 일정 */}
          <section ref={dayDetails} className="calendar-aside" aria-label="선택한 날짜 일정">
            <h3>{day}</h3>
            {events
              .filter(e => e.date <= day && e.endDate >= day)
              .sort(order)
              .map(eventRow)}
            {!events.some(e => e.date <= day && e.endDate >= day) && <p className="note-line">일정 없음</p>}
          </section>
        </div>
      )}
    </div>
  );
}
