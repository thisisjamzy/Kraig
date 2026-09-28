'use client';

// The Calendar on medium screens and up: Day, Week and Month views
// (phones keep ProjectsCalendarView, unchanged). Same logic hook, same
// cards and overlap rules. Expanded and large add a left column with the
// mini month and filters (Google events, free tasks, project dates and
// payments). Clicking a task opens it in the side panel, a Google event
// its page; clicking an empty slot starts a new task there.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FolderKanban, Plus, Wallet } from 'lucide-react';
import { buildSchedule, isoDate, type useLogic } from '@/src/logic/projectsCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { layoutDay } from '@/src/viewmodels/dayLayout';
import { TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { CalendarSyncStatus } from '@/src/widgets/CalendarSyncStatus/CalendarSyncStatus';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import { eventHref } from '@/src/widgets/GoogleEventCard/GoogleEventCard';
import { MiniMonth, TimelinePanel } from '@/src/screens/Today/TodayScreen';
import styles from './CalendarWide.module.css';

type Logic = ReturnType<typeof useLogic>;
type View = 'day' | 'week' | 'month';
type Agenda = ReturnType<Logic['agendaForDate']>;

interface Filters {
  google: boolean;
  free: boolean;
  dates: boolean;
}

const WEEK_HOUR = 52; // px per hour in the week grid
const MAX_COLUMNS = 2; // side by side in a week column before "+N"

function dateOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function shift(iso: string, days: number) {
  const d = dateOf(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}
function shiftMonths(iso: string, months: number) {
  const d = dateOf(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}
function mondayOf(iso: string) {
  return shift(iso, -((dateOf(iso).getDay() + 6) % 7));
}
function hhmm(min: number) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** One day's items with the filters applied. */
function filtered(agenda: Agenda, f: Filters) {
  const tasks = agenda.taskItems.filter((t) => f.free || t.timeMode !== 'free' || t.allDay);
  const google = f.google ? agenda.googleItems : [];
  return { tasks, google, projects: f.dates ? agenda.projectItems : [], payments: f.dates ? agenda.paymentItems : [] };
}

/** Timed items of one day as schedule input (tasks and Google events). */
function timedItems(day: ReturnType<typeof filtered>) {
  return [
    ...day.tasks.filter((t) => !t.allDay).map((t) => ({ ...t, google: undefined })),
    ...day.google
      .filter((e) => !e.allDay)
      .map((e) => ({ id: `google:${e.id}`, startTime: e.startTime, dueDate: e.dueDate, google: e })),
  ];
}

export function CalendarWide({ logic }: { logic: Logic }) {
  const { deviceClass } = useLayout();
  const taskPanel = useTaskPanel();
  const [view, setView] = useState<View>('week');
  const [filters, setFilters] = useState<Filters>({ google: true, free: true, dates: true });
  const { selectedDate, pickDate, jumpToToday, todayIso } = logic;
  const withSidebar = deviceClass !== 'medium';

  function step(dir: -1 | 1) {
    if (view === 'day') pickDate(shift(selectedDate, dir));
    else if (view === 'week') pickDate(shift(selectedDate, 7 * dir));
    else pickDate(shiftMonths(selectedDate, dir));
  }
  const newTaskAt = (iso: string, minute?: number) =>
    taskPanel.open('new', minute === undefined ? { date: iso } : { date: iso, start: hhmm(Math.floor(minute / 30) * 30) });

  const title = useMemo(() => {
    const d = dateOf(selectedDate);
    if (view === 'day') return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (view === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const mon = dateOf(mondayOf(selectedDate));
    const sun = dateOf(shift(mondayOf(selectedDate), 6));
    const sameMonth = mon.getMonth() === sun.getMonth();
    return `${mon.getDate()}${sameMonth ? '' : ` ${mon.toLocaleDateString('en-GB', { month: 'short' })}`} – ${sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }, [view, selectedDate]);

  // Day view: the Today timeline, narrowed by the filters.
  const dayOverride = useMemo(() => {
    const day = filtered(logic.agendaForDate(selectedDate), filters);
    return {
      schedule: buildSchedule(timedItems(day), selectedDate),
      allDayTasks: day.tasks.filter((t) => t.allDay),
      allDayGoogle: day.google.filter((e) => e.allDay),
    };
    // agendaForDate reads the loaded data; the agenda object changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic.agenda, selectedDate, filters]);

  return (
    <div className={styles.page}>
      <TopBarControls>
        <div className={styles.views} role="tablist" aria-label="Calendar view">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={styles.view} onClick={() => setView(v)}>
              {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <div className={styles.stepper}>
          <button type="button" className={styles.icon} onClick={() => step(-1)} aria-label={`Previous ${view}`}>
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <span className={styles.range}>{title}</span>
          <button type="button" className={styles.icon} onClick={() => step(1)} aria-label={`Next ${view}`}>
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        </div>
        {selectedDate !== todayIso && (
          <button type="button" className={styles.pill} onClick={jumpToToday}>
            Today
          </button>
        )}
        <button type="button" className={styles.primary} onClick={() => newTaskAt(selectedDate)}>
          <Plus size={16} strokeWidth={2.5} aria-hidden />
          New
        </button>
      </TopBarControls>

      <ScreenState loading={logic.loading} />
      <div className={styles.layout} data-sidebar={withSidebar || undefined}>
        {withSidebar && (
          <aside className={styles.side} aria-label="Month and filters">
            <MiniMonth logic={logic} />
            <section className={styles.card} aria-label="Show">
              <h2 className={styles.cardTitle}>Show</h2>
              {(
                [
                  ['google', 'Google Calendar events'],
                  ['free', 'Free tasks'],
                  ['dates', 'Project dates and payments'],
                ] as [keyof Filters, string][]
              ).map(([key, label]) => (
                <label key={key} className={styles.toggle}>
                  <input type="checkbox" checked={filters[key]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
              <span className={styles.sync}>
                <CalendarSyncStatus range={logic.syncRange} />
              </span>
            </section>
          </aside>
        )}
        <section className={styles.main} aria-label={title}>
          {view === 'day' && <TimelinePanel logic={logic} showWeek={false} override={dayOverride} />}
          {view === 'week' && <WeekView logic={logic} filters={filters} onEmpty={newTaskAt} />}
          {view === 'month' && (
            <MonthView
              logic={logic}
              filters={filters}
              onDay={(iso) => {
                pickDate(iso);
                setView('day');
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ---- Week ----

interface Block {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  href: string;
  google: boolean;
  free: boolean;
  blocked: boolean;
}

function WeekView({ logic, filters, onEmpty }: { logic: Logic; filters: Filters; onEmpty: (iso: string, minute: number) => void }) {
  const { hrefFor } = useTaskPanel();
  const [popover, setPopover] = useState<{ day: string; items: Block[]; top: number } | null>(null);
  const monday = mondayOf(logic.selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => shift(monday, i));

  const columns = days.map((iso) => {
    const day = filtered(logic.agendaForDate(iso), filters);
    const schedule = buildSchedule(timedItems(day), iso);
    const blocks: Block[] = schedule.items.map((item) =>
      item.google
        ? {
            id: item.id,
            title: item.google.title,
            startMin: item.startMin,
            endMin: item.endMin,
            href: eventHref(item.google.id),
            google: true,
            free: !item.google.blocksTime,
            blocked: item.google.blocksTime,
          }
        : {
            id: item.id,
            title: item.title,
            startMin: item.startMin,
            endMin: item.endMin,
            href: hrefFor(item.id),
            google: false,
            free: item.timeMode === 'free',
            blocked: item.timeMode === 'blocked',
          }
    );
    const allDay = [
      ...day.tasks.filter((t) => t.allDay).map((t) => ({ key: t.id, title: t.title, href: hrefFor(t.id), google: false })),
      ...day.google.filter((e) => e.allDay).map((e) => ({ key: e.id, title: e.title, href: eventHref(e.id), google: true })),
      ...day.projects.map((p) => ({ key: `p-${p.id}-${p.label}`, title: `${p.title} · ${p.label}`, href: `/projects/${p.id}`, google: false })),
      ...day.payments.map((p) => ({ key: `pay-${p.id}`, title: p.title, href: '/payments', google: false })),
    ];
    return { iso, blocks, allDay };
  });

  const firstHour = Math.min(8, ...columns.flatMap((c) => c.blocks.map((b) => Math.floor(b.startMin / 60))));
  const lastHour = Math.min(24, Math.max(firstHour + 10, ...columns.flatMap((c) => c.blocks.map((b) => Math.ceil(b.endMin / 60)))));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const px = (min: number) => ((min - firstHour * 60) / 60) * WEEK_HOUR;
  const hasAllDay = columns.some((c) => c.allDay.length > 0);

  return (
    <div className={styles.week}>
      <div className={styles.weekHead}>
        <span />
        {columns.map(({ iso }) => (
          <button
            key={iso}
            type="button"
            className={styles.weekDay}
            data-today={iso === logic.todayIso || undefined}
            aria-pressed={iso === logic.selectedDate}
            onClick={() => logic.pickDate(iso)}
          >
            <span className={styles.weekName}>{dateOf(iso).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className={styles.weekNum}>{dateOf(iso).getDate()}</span>
          </button>
        ))}
      </div>
      {hasAllDay && (
        <div className={styles.weekAllDay}>
          <span className={styles.gutterLabel}>All day</span>
          {columns.map(({ iso, allDay }) => (
            <div key={iso} className={styles.allDayCell}>
              {allDay.slice(0, 3).map((a) => (
                <Link key={a.key} href={a.href} scroll={false} className={styles.chip}>
                  {a.google && <GoogleMark size={11} />}
                  {a.title}
                </Link>
              ))}
              {allDay.length > 3 && <span className={styles.more}>+{allDay.length - 3} more</span>}
            </div>
          ))}
        </div>
      )}
      <div className={styles.weekBody} style={{ height: hours.length * WEEK_HOUR }}>
        <div className={styles.gutter}>
          {hours.map((h) => (
            <span key={h} className={styles.hour} style={{ top: (h - firstHour) * WEEK_HOUR }}>
              {hhmm(h * 60)}
            </span>
          ))}
        </div>
        {columns.map(({ iso, blocks }) => {
          const layout = layoutDay(blocks, firstHour, WEEK_HOUR);
          const byId = new Map(blocks.map((b) => [b.id, b]));
          return (
            <div
              key={iso}
              className={styles.weekCol}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                onEmpty(iso, firstHour * 60 + (y / WEEK_HOUR) * 60);
              }}
              role="presentation"
            >
              {hours.map((h) => (
                <span key={h} className={styles.hourLine} style={{ top: (h - firstHour) * WEEK_HOUR }} aria-hidden />
              ))}
              {layout.groups.map((group) => {
                const members = group.itemIds.map((id) => byId.get(id)!);
                const cols = Math.min(group.columnCount, MAX_COLUMNS);
                const shown = members.filter((b) => (layout.byId.get(b.id)?.column ?? 0) < cols);
                const hidden = members.length - shown.length;
                return (
                  <div key={group.id}>
                    {shown.map((b) => {
                      const l = layout.byId.get(b.id)!;
                      const width = 100 / (hidden > 0 ? cols + 0.6 : cols);
                      return (
                        <Link
                          key={b.id}
                          href={b.href}
                          scroll={false}
                          className={styles.block}
                          data-google={b.google || undefined}
                          data-free={b.free || undefined}
                          data-blocked={b.blocked || undefined}
                          style={{ top: px(b.startMin) + 1, height: Math.max(18, px(b.endMin) - px(b.startMin) - 2), left: `${l.column * width}%`, width: `calc(${width}% - 3px)` }}
                          title={`${b.title} · ${hhmm(b.startMin)}–${hhmm(b.endMin)}`}
                        >
                          <span className={styles.blockTitle}>
                            {b.google && <GoogleMark size={10} />}
                            {b.title}
                          </span>
                          {b.endMin - b.startMin >= 45 && <span className={styles.blockTime}>{hhmm(b.startMin)}</span>}
                        </Link>
                      );
                    })}
                    {hidden > 0 && (
                      <button
                        type="button"
                        className={styles.plus}
                        style={{ top: px(group.startMin) + 1 }}
                        onClick={() => setPopover({ day: iso, items: members, top: px(group.startMin) })}
                        aria-label={`${hidden} more at ${hhmm(group.startMin)}`}
                      >
                        +{hidden}
                      </button>
                    )}
                  </div>
                );
              })}
              {popover?.day === iso && (
                <div className={styles.popover} style={{ top: popover.top + 28 }} role="dialog" aria-label="Everything in this slot">
                  <button type="button" className={styles.popoverClose} onClick={() => setPopover(null)} aria-label="Close">
                    ×
                  </button>
                  {popover.items.map((b) => (
                    <Link key={b.id} href={b.href} scroll={false} className={styles.popoverItem} onClick={() => setPopover(null)}>
                      <span className={styles.blockTime}>
                        {hhmm(b.startMin)}–{hhmm(b.endMin)}
                      </span>
                      <span className={styles.popoverTitle}>
                        {b.google && <GoogleMark size={11} />}
                        {b.title}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Month ----

function MonthView({ logic, filters, onDay }: { logic: Logic; filters: Filters; onDay: (iso: string) => void }) {
  const { hrefFor } = useTaskPanel();
  // A 6-week grid around the selected date's month.
  const d = dateOf(logic.selectedDate);
  const first = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => shift(start, i));
  return (
    <div className={styles.month}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
        <span key={w} className={styles.monthWeekday}>
          {w}
        </span>
      ))}
      {cells.map((iso) => {
        const day = filtered(logic.agendaForDate(iso), filters);
        const items = [
          ...day.google.map((e) => ({ key: `g-${e.id}`, title: e.title, href: eventHref(e.id), google: true, at: e.allDay ? -1 : e.startTime.getTime(), icon: null })),
          ...day.tasks.map((t) => ({ key: t.id, title: t.title, href: hrefFor(t.id), google: false, at: t.allDay ? -1 : (t.startTime ?? t.dueDate)?.getTime() ?? 0, icon: null })),
          ...day.projects.map((p) => ({ key: `p-${p.id}-${p.label}`, title: p.title, href: `/projects/${p.id}`, google: false, at: -2, icon: 'project' as const })),
          ...day.payments.map((p) => ({ key: `pay-${p.id}`, title: p.title, href: '/payments', google: false, at: -2, icon: 'payment' as const })),
        ].sort((a, b) => a.at - b.at);
        const outside = dateOf(iso).getMonth() !== d.getMonth();
        return (
          <div key={iso} className={styles.monthCell} data-outside={outside || undefined} data-today={iso === logic.todayIso || undefined}>
            <button type="button" className={styles.monthNum} onClick={() => onDay(iso)} aria-label={`Open ${dateOf(iso).toDateString()}`}>
              {dateOf(iso).getDate()}
            </button>
            {items.slice(0, 3).map((i) => (
              <Link key={i.key} href={i.href} scroll={false} className={styles.chip}>
                {i.google && <GoogleMark size={11} />}
                {i.icon === 'project' && <FolderKanban size={11} strokeWidth={2.25} aria-hidden />}
                {i.icon === 'payment' && <Wallet size={11} strokeWidth={2.25} aria-hidden />}
                {i.title}
              </Link>
            ))}
            {items.length > 3 && (
              <button type="button" className={styles.more} onClick={() => onDay(iso)}>
                +{items.length - 3} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
