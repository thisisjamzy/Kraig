'use client';

// Today — the start-of-day screen for medium screens and up (the Time
// hub, /projects, renders it there; phones keep ProjectsHub). The whole
// day on one screen, all driven by one selected date:
//   expanded / large  mini month · day stats · next up | day timeline | tasks
//   medium            mini month · day stats · next up | Tasks / Timeline
//   large also shows a week strip above the timeline.
// Data comes from the Calendar's own logic hook (src/logic/
// projectsCalendar) — no second copy of any of it. Hovering a task in the
// list rings it on the timeline and the other way round; any task opens
// in the side panel. Keys (with a keyboard): ← → change day, T today,
// N new task.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { useLogic, HOUR_HEIGHT, isoDate } from '@/src/logic/projectsCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { TaskCheckRow } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import { DailyProgressCard } from '@/src/widgets/DailyProgressCard/DailyProgressCard';
import { GoogleEventCard } from '@/src/widgets/GoogleEventCard/GoogleEventCard';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import { CalendarSyncStatus } from '@/src/widgets/CalendarSyncStatus/CalendarSyncStatus';
import { SplitView } from '@/src/widgets/Layout/SplitView';
import { TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { DayTimeline } from '@/src/screens/ProjectsCalendar/DayTimeline';
import calendarStyles from '@/src/screens/ProjectsCalendar/ProjectsCalendarScreen.module.css';
import styles from './TodayScreen.module.css';

type Logic = ReturnType<typeof useLogic>;
type TaskFilter = 'pending' | 'done' | 'cancelled';
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function shiftIso(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}
function dateOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function clock(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
/** Hovered or focused task in either panel — shared highlight. */
function keyFrom(target: EventTarget | null): string | null {
  const el = (target as HTMLElement | null)?.closest?.('[data-highlight-key]');
  return el?.getAttribute('data-highlight-key') ?? null;
}

export function TodayScreen() {
  const logic = useLogic();
  const { deviceClass, finePointer } = useLayout();
  const taskPanel = useTaskPanel();
  const [highlight, setHighlight] = useState<string | null>(null);
  const { selectedDate, pickDate, jumpToToday, todayIso } = logic;

  // Keyboard: ← → day, T today, N new task (not while typing or in a panel).
  useEffect(() => {
    if (!finePointer) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[data-panel-open], [role="dialog"]')) return;
      if (e.key === 'ArrowLeft') pickDate(shiftIso(selectedDate, -1));
      else if (e.key === 'ArrowRight') pickDate(shiftIso(selectedDate, 1));
      else if (e.key === 't' || e.key === 'T') jumpToToday();
      else if (e.key === 'n' || e.key === 'N') taskPanel.open('new', { date: selectedDate });
      else return;
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finePointer, selectedDate, pickDate, jumpToToday, taskPanel]);

  const hover = {
    onMouseOver: (e: React.MouseEvent) => setHighlight(keyFrom(e.target)),
    onFocus: (e: React.FocusEvent) => setHighlight(keyFrom(e.target)),
    onMouseLeave: () => setHighlight(null),
  };

  const left = (
    <>
      <MiniMonth logic={logic} />
      <DayStats logic={logic} />
      <NextUp logic={logic} />
    </>
  );
  const timeline = <TimelinePanel logic={logic} highlight={highlight} hover={hover} showWeek={deviceClass === 'large'} />;
  const tasks = <TaskPanel logic={logic} highlight={highlight} hover={hover} />;

  return (
    <div className={styles.page}>
      <TopBarControls>
        <div className={styles.dateNav}>
          <button type="button" className={styles.navButton} onClick={() => pickDate(shiftIso(selectedDate, -1))} aria-label="Previous day" title="Previous day (←)">
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <label className={styles.dateLabel}>
            <span>{dateOf(selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={selectedDate}
              onChange={(e) => e.target.value && pickDate(e.target.value)}
              aria-label="Pick a date"
            />
          </label>
          <button type="button" className={styles.navButton} onClick={() => pickDate(shiftIso(selectedDate, 1))} aria-label="Next day" title="Next day (→)">
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
          {selectedDate !== todayIso && (
            <button type="button" className={styles.todayButton} onClick={jumpToToday} title="Today (T)">
              Today
            </button>
          )}
        </div>
        <span className={styles.sync}>
          <CalendarSyncStatus range={logic.syncRange} />
        </span>
      </TopBarControls>

      <ScreenState loading={logic.loading} />
      {deviceClass === 'medium' ? (
        <SplitView
          panels={[
            { key: 'left', width: '45fr', label: 'Month and day summary', content: left },
            { key: 'right', width: '55fr', label: 'Tasks and timeline', content: <MediumRight tasks={tasks} timeline={timeline} /> },
          ]}
        />
      ) : (
        <SplitView
          panels={[
            { key: 'left', width: 320, label: 'Month and day summary', content: left },
            { key: 'center', width: 'flex', label: 'Day timeline', content: timeline },
            { key: 'right', width: 380, label: 'Tasks for this day', content: tasks },
          ]}
        />
      )}
    </div>
  );
}

function MediumRight({ tasks, timeline }: { tasks: React.ReactNode; timeline: React.ReactNode }) {
  const [view, setView] = useState<'tasks' | 'timeline'>('tasks');
  return (
    <>
      <div className={styles.segmented} role="tablist" aria-label="View">
        {(['tasks', 'timeline'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={styles.segment} onClick={() => setView(v)}>
            {v === 'tasks' ? 'Tasks' : 'Timeline'}
          </button>
        ))}
      </div>
      {view === 'tasks' ? tasks : timeline}
    </>
  );
}

// ---- Left column ----

function MiniMonth({ logic }: { logic: Logic }) {
  const { monthCursor, monthGrid, selectedDate, todayIso, daysWithItems, pickDate, shiftMonth } = logic;
  return (
    <section className={styles.monthCard} aria-label="Month">
      <div className={styles.monthHead}>
        <span className={styles.monthTitle}>{monthCursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
        <span className={styles.monthNav}>
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={16} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight size={16} strokeWidth={2.25} />
          </button>
        </span>
      </div>
      <div className={styles.monthGrid} role="grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className={styles.weekday} aria-hidden>
            {d}
          </span>
        ))}
        {monthGrid.map((cell) => (
          <button
            key={cell.iso}
            type="button"
            role="gridcell"
            className={styles.day}
            aria-selected={cell.iso === selectedDate}
            aria-label={dateOf(cell.iso).toDateString()}
            data-outside={!cell.inMonth || undefined}
            data-today={cell.iso === todayIso || undefined}
            onClick={() => pickDate(cell.iso)}
          >
            {cell.day}
            {daysWithItems.has(cell.iso) && <span className={styles.dot} aria-hidden />}
          </button>
        ))}
      </div>
    </section>
  );
}

function DayStats({ logic }: { logic: Logic }) {
  const { taskItems, googleItems } = logic.agenda;
  const done = taskItems.filter((t) => t.done).length;
  const blockedMinutes = taskItems
    .filter((t) => !t.allDay && t.timeMode === 'blocked' && t.startTime && t.dueDate)
    .reduce((n, t) => n + Math.max(0, (t.dueDate!.getTime() - t.startTime!.getTime()) / 60000), 0);
  const meetings = googleItems.filter((e) => e.kind === 'meeting').length + taskItems.filter((t) => t.type === 'Meeting').length;
  const overdue = taskItems.filter((t) => t.overdue && !t.done).length;
  const hours = blockedMinutes / 60;
  return (
    <section className={styles.stats} aria-label="Day stats">
      <DailyProgressCard done={done} total={taskItems.length} />
      <div className={styles.figures}>
        <div className={styles.figure}>
          <span className={styles.figureValue}>{Number.isInteger(hours) ? hours : hours.toFixed(1)}h</span>
          <span className={styles.figureLabel}>focus blocked</span>
        </div>
        <div className={styles.figure}>
          <span className={styles.figureValue}>{meetings}</span>
          <span className={styles.figureLabel}>{meetings === 1 ? 'meeting' : 'meetings'}</span>
        </div>
        <div className={styles.figure} data-alert={overdue > 0 || undefined}>
          <span className={styles.figureValue}>{overdue}</span>
          <span className={styles.figureLabel}>overdue</span>
        </div>
      </div>
    </section>
  );
}

function NextUp({ logic }: { logic: Logic }) {
  const minute = useNowMinute();
  const { hrefFor } = useTaskPanel();
  const { taskItems, googleItems } = logic.agenda;
  const isToday = logic.selectedDate === logic.todayIso;
  const now = minute * 60000;
  const items = [
    ...taskItems
      .filter((t) => !t.done && !t.allDay && t.startTime)
      .map((t) => ({ key: t.id, title: t.title, start: t.startTime!, href: hrefFor(t.id), link: null as string | null, google: false })),
    ...googleItems
      .filter((e) => !e.allDay)
      .map((e) => ({ key: `g-${e.id}`, title: e.title, start: e.startTime, href: `/projects/calendar/events/${encodeURIComponent(e.id)}`, link: e.meetingLink ?? null, google: true })),
  ]
    .filter((i) => !isToday || i.start.getTime() >= now - 5 * 60000)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 3);
  return (
    <section className={styles.card} aria-label="Next up">
      <h2 className={styles.cardTitle}>Next up</h2>
      {items.length === 0 ? (
        <p className={styles.muted}>{isToday ? 'Nothing else scheduled today.' : 'Nothing scheduled.'}</p>
      ) : (
        <ul className={styles.nextList}>
          {items.map((i) => (
            <li key={i.key} className={styles.nextItem}>
              <span className={styles.nextTime}>{clock(i.start)}</span>
              <Link href={i.href} scroll={false} className={styles.nextTitle}>
                {i.google && <GoogleMark size={12} />}
                {i.title}
              </Link>
              {i.link && /^https:\/\//i.test(i.link) && (
                <a className={styles.join} href={i.link} target="_blank" rel="noopener noreferrer">
                  <Video size={14} strokeWidth={2.25} aria-hidden />
                  Join
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Center: the day timeline ----

type Hover = {
  onMouseOver: (e: React.MouseEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onMouseLeave: () => void;
};

function hourLabel(hour: number) {
  return `${String(hour % 24).padStart(2, '0')}.00`;
}

function TimelinePanel({ logic, highlight, hover, showWeek }: { logic: Logic; highlight: string | null; hover: Hover; showWeek: boolean }) {
  const { schedule, allDayGoogle, allDayTasks, selectedDate, todayIso } = logic;
  const minute = useNowMinute();
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date(minute * 60000);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = selectedDate === todayIso;
  const nowTop = ((nowMin - schedule.firstHour * 60) / 60) * HOUR_HEIGHT;
  const showNow = isToday && nowTop >= 0 && nowTop <= schedule.height;

  // Open at the current time (today) or the first item.
  useEffect(() => {
    const el = scrollRef.current?.closest('section');
    if (!el) return;
    const first = schedule.items[0]?.top ?? 0;
    el.scrollTo({ top: Math.max(0, (isToday ? nowTop : first) - 120), behavior: 'auto' });
    // Only when the day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  return (
    <div className={styles.timelineWrap} ref={scrollRef}>
      {showWeek && <WeekStrip logic={logic} />}
      {(allDayGoogle.length > 0 || allDayTasks.length > 0) && (
        <div className={styles.allDay} aria-label="All day">
          {allDayTasks.map((t) => (
            <TaskCheckRow key={t.id} task={t} timeOnly highlightKey={t.id} />
          ))}
          {allDayGoogle.map((e) => (
            <GoogleEventCard key={e.id} event={e} />
          ))}
        </div>
      )}
      <div className={`${calendarStyles.timeline} ${styles.timeline}`} style={{ height: schedule.height + 24 }} {...hover}>
        {schedule.hours.map((hour) => (
          <div key={hour} className={calendarStyles.hourRow} style={{ top: (hour - schedule.firstHour) * HOUR_HEIGHT }} aria-hidden>
            <span className={calendarStyles.hourLabel}>{hourLabel(hour)}</span>
            <span className={calendarStyles.hourLine} />
          </div>
        ))}
        {showNow && (
          <div className={styles.nowLine} style={{ top: nowTop }} aria-label={`Now, ${clock(now)}`} role="img">
            <span className={styles.nowDot} />
          </div>
        )}
        <DayTimeline items={schedule.items} groups={schedule.groups} highlight={highlight} />
        {schedule.items.length === 0 && <p className={calendarStyles.emptyDay}>Nothing scheduled.</p>}
      </div>
    </div>
  );
}

function WeekStrip({ logic }: { logic: Logic }) {
  const { selectedDate, todayIso, pickDate, agendaForDate } = logic;
  const d = dateOf(selectedDate);
  const monday = shiftIso(selectedDate, -((d.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shiftIso(monday, i));
  return (
    <div className={styles.week} role="group" aria-label="This week">
      {days.map((iso) => {
        const agenda = agendaForDate(iso);
        const count = agenda.taskItems.length + agenda.googleItems.length;
        return (
          <button
            key={iso}
            type="button"
            className={styles.weekDay}
            aria-pressed={iso === selectedDate}
            data-today={iso === todayIso || undefined}
            onClick={() => pickDate(iso)}
          >
            <span className={styles.weekName}>{dateOf(iso).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className={styles.weekNum}>{dateOf(iso).getDate()}</span>
            <span className={styles.weekCount}>{count ? `${count} item${count === 1 ? '' : 's'}` : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Right: the day's tasks ----

function TaskPanel({ logic, highlight, hover }: { logic: Logic; highlight: string | null; hover: Hover }) {
  const [filter, setFilter] = useState<TaskFilter>('pending');
  const [anytimeOpen, setAnytimeOpen] = useState(true);
  const { taskItems, cancelledTaskItems } = logic.agenda;
  const timed = useMemo(() => {
    const list = filter === 'cancelled' ? cancelledTaskItems : taskItems.filter((t) => (filter === 'done' ? t.done : !t.done));
    return list;
  }, [filter, taskItems, cancelledTaskItems]);
  const scheduled = timed.filter((t) => !t.allDay);
  const anytime = timed.filter((t) => t.allDay);
  const counts = {
    pending: taskItems.filter((t) => !t.done).length,
    done: taskItems.filter((t) => t.done).length,
    cancelled: cancelledTaskItems.length,
  };
  return (
    <div className={styles.taskPanel} {...hover}>
      <div className={styles.segmented} role="tablist" aria-label="Show">
        {(['pending', 'done', 'cancelled'] as TaskFilter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={styles.segment} onClick={() => setFilter(f)}>
            {f === 'pending' ? 'Pending' : f === 'done' ? 'Done' : 'Cancelled'} <span className={styles.count}>{counts[f]}</span>
          </button>
        ))}
      </div>
      {scheduled.length === 0 && anytime.length === 0 && (
        <p className={styles.muted}>{filter === 'pending' ? 'Nothing left to do on this day.' : `No ${filter} tasks on this day.`}</p>
      )}
      <div className={styles.taskList}>
        {scheduled.map((t) => (
          <div key={t.id} data-lit={highlight === t.id || undefined} className={styles.taskRow}>
            <TaskCheckRow task={{ ...t, context: t.projectName }} timeOnly highlightKey={t.id} />
          </div>
        ))}
      </div>
      {anytime.length > 0 && (
        <div className={styles.anytime}>
          <button type="button" className={styles.anytimeHead} aria-expanded={anytimeOpen} onClick={() => setAnytimeOpen((v) => !v)}>
            <ChevronDown size={16} strokeWidth={2.25} className={styles.chevron} aria-hidden />
            Anytime <span className={styles.count}>{anytime.length}</span>
          </button>
          {anytimeOpen && (
            <div className={styles.taskList}>
              {anytime.map((t) => (
                <div key={t.id} data-lit={highlight === t.id || undefined} className={styles.taskRow}>
                  <TaskCheckRow task={{ ...t, context: t.projectName }} timeOnly highlightKey={t.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
