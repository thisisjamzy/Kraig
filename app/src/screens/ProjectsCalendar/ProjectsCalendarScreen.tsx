'use client';

// Calendar (Dreda v1.0 `Calendar / Web / Week` 54090).
//   Title "Calendar"; under it "Week 47 · 16 to 22 November · 17 h blocked,
//   4 tasks to place". Top bar: Today, back and forward, Day, Week and
//   Month, beside New task.
//   The grid: tasks, Google events, project dates and payments, each block
//   on its project's (else its type's) label hue with the bar on its top
//   edge; today's date on lime and the now line with its lime chip.
//   Beside it the To plan tray: Unscheduled, Overdue and This week. Cards
//   drag onto the grid to block their time; Plan my day fills today's free
//   time. Hide folds the tray away.
//   Medium screens open on Day.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, PanelRight, Zap } from 'lucide-react';
import { useLogic, type TimeCalendarLogic } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { dayFromIso, isoDay, mondayOf, shiftDay, type CalItem } from '@/src/viewmodels/calendarItems';
import { dayText, durationText, isToPlan, lateText, weekNumber } from '@/src/viewmodels/todayPlan';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { MonthGrid } from '@/src/widgets/TimeCalendar/MonthGrid';
import { TimeGrid } from '@/src/widgets/TimeCalendar/TimeGrid';
import { DayChip, LatePill, TaskTrayCard } from '@/src/widgets/TaskChips/TaskTrayCard';
import { BookingRequest } from '@/src/widgets/SchedulingLinks/BookingRequest';
import styles from './ProjectsCalendarScreen.module.css';

type View = 'day' | 'week' | 'month';
type TrayTab = 'unscheduled' | 'overdue' | 'week';

function monthShift(iso: string, by: number) {
  const d = dayFromIso(iso);
  return isoDay(new Date(d.getFullYear(), d.getMonth() + by, 1));
}

/** "16 to 22 November", "28 September to 4 October". */
function weekSpan(iso: string) {
  const mon = dayFromIso(mondayOf(iso));
  const sun = dayFromIso(shiftDay(mondayOf(iso), 6));
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
  return mon.getMonth() === sun.getMonth() ? `${mon.getDate()} to ${sun.getDate()} ${month(sun)}` : `${mon.getDate()} ${month(mon)} to ${sun.getDate()} ${month(sun)}`;
}

export function ProjectsCalendarScreen() {
  const logic = useLogic();
  const router = useRouter();
  const taskPanel = useTaskPanel();
  const { deviceClass } = useLayout();
  const [view, setView] = useState<View>(() => (deviceClass === 'medium' ? 'day' : 'week'));
  const [trayOpen, setTrayOpen] = useState(deviceClass !== 'medium');
  const { selected, today, pick } = logic;

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDay(mondayOf(selected), i)), [selected]);
  const blocked = week.reduce((sum, iso) => sum + logic.busyOn(iso).reduce((s, b) => s + b.endMin - b.startMin, 0), 0);
  const toPlace = logic.toPlan.length + logic.overdue.filter((r) => isToPlan(r)).length;
  const sub = [`Week ${weekNumber(dayFromIso(selected))}`, weekSpan(selected), `${durationText(blocked)} blocked, ${toPlace} ${toPlace === 1 ? 'task' : 'tasks'} to place`].join(' · ');

  const [bookingId, setBookingId] = useState<string | null>(null);
  const opened = bookingId ? logic.bookingOf(bookingId) : null;

  function open(item: CalItem) {
    if (item.bookingId) setBookingId(item.bookingId);
    else if (item.taskId) taskPanel.open(item.taskId);
    else if (item.href) router.push(item.href);
  }
  const newAt = (iso: string, minute?: number) =>
    taskPanel.open('new', minute === undefined ? { date: iso } : { date: iso, start: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` });
  const step = (by: number) => pick(view === 'month' ? monthShift(selected, by) : shiftDay(selected, view === 'week' ? by * 7 : by));

  const common = {
    itemsOn: (iso: string) => logic.itemsOn(iso),
    today,
    onOpen: open,
    onEmpty: newAt,
    onMove: (item: CalItem, iso: string, startMin: number, endMin: number) => (item.taskId ? logic.scheduleAt(item.taskId, iso, startMin, endMin) : undefined),
    onDropTask: (id: string, iso: string, minute: number) => logic.scheduleAt(id, iso, minute),
    maxHeight: 'calc(100dvh - 230px)',
  };

  return (
    <NotionPage title="Calendar" sub={sub} crumbs={[{ label: 'Calendar', href: '/projects/calendar' }]} menu={[{ label: 'Scheduling links', href: '/projects/calendar/links' }]}>
      <ScreenState loading={logic.loading} />
      <TopBarControls>
        <button type="button" className={styles.pill} onClick={logic.goToday} disabled={selected === today && view !== 'month'}>
          Today
        </button>
        <button type="button" className={styles.round} onClick={() => step(-1)} aria-label={`Previous ${view}`}>
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <button type="button" className={styles.round} onClick={() => step(1)} aria-label={`Next ${view}`}>
          <ChevronRight size={20} strokeWidth={2} />
        </button>
        <div className={styles.segmented} role="tablist" aria-label="View">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </TopBarControls>

      <div className={styles.frame} data-tray={trayOpen || undefined}>
        <div className={styles.grid}>
          {view === 'month' ? (
            <MonthGrid selected={selected} today={today} itemsOn={common.itemsOn} onOpen={open} onDay={(iso) => (pick(iso), setView('day'))} compact={false} />
          ) : view === 'week' ? (
            <TimeGrid mode="week" days={week} selected={selected} onPickDay={pick} barsBelow={deviceClass === 'medium' ? 90 : undefined} {...common} />
          ) : (
            <TimeGrid mode="day" days={[selected]} {...common} />
          )}
        </div>
        {trayOpen ? (
          <Tray logic={logic} week={week} onHide={() => setTrayOpen(false)} />
        ) : (
          <button type="button" className={styles.showTray} onClick={() => setTrayOpen(true)}>
            <PanelRight size={18} strokeWidth={2} aria-hidden />
            To plan <span className={styles.count}>{toPlace}</span>
          </button>
        )}
      </div>
      {opened && (
        <BookingRequest
          booking={opened.booking}
          link={opened.link}
          onAnswer={(a) => logic.answerBooking(opened.booking.id, a)}
          onClose={() => setBookingId(null)}
        />
      )}
    </NotionPage>
  );
}

/** The To plan tray (Dreda v1.0 `Task tray`). */
function Tray({ logic, week, onHide }: { logic: TimeCalendarLogic; week: string[]; onHide: () => void }) {
  const taskPanel = useTaskPanel();
  const [tab, setTab] = useState<TrayTab>('unscheduled');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const now = new Date();

  const lists = useMemo(() => {
    const from = dayFromIso(week[0]);
    const to = dayFromIso(shiftDay(week[6], 1));
    const lateUnblocked = logic.overdue.filter((r) => isToPlan(r));
    return {
      unscheduled: [...lateUnblocked, ...logic.toPlan],
      overdue: logic.overdue,
      week: logic.toPlan.filter((r) => r.date && r.date >= from && r.date < to),
    } satisfies Record<TrayTab, TaskRow[]>;
  }, [logic.overdue, logic.toPlan, week]);
  const rows = lists[tab];

  async function plan() {
    setBusy(true);
    setNote(null);
    try {
      const placed = await logic.planMyDay();
      setNote(placed === 0 ? 'No free time left today for these.' : `Planned ${placed} ${placed === 1 ? 'task' : 'tasks'} into today.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not plan the day.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={styles.tray} aria-label="To plan">
      <div className={styles.trayHead}>
        <h2 className={styles.trayTitle}>To plan</h2>
        <span className={styles.trayMeta}>
          {lists.unscheduled.length} to place
        </span>
        <button type="button" className={styles.hide} onClick={onHide}>
          <PanelRight size={18} strokeWidth={2} aria-hidden />
          Hide
        </button>
      </div>
      <div className={styles.trayTabs} role="tablist" aria-label="Which tasks">
        {(
          [
            ['unscheduled', 'Unscheduled'],
            ['overdue', 'Overdue'],
            ['week', 'This week'],
          ] as [TrayTab, string][]
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label} {lists[key].length}
          </button>
        ))}
      </div>
      <div className={styles.trayList}>
        {rows.length === 0 ? (
          <p className={styles.trayEmpty}>{tab === 'overdue' ? 'Nothing overdue.' : 'Nothing left to place.'}</p>
        ) : (
          rows.map((r) => {
            const late = r.overdue ? lateText(r.date, now) : null;
            return (
              <TaskTrayCard
                key={r.id}
                row={r}
                onOpen={() => taskPanel.open(r.id)}
                right={late ? <LatePill>{late}</LatePill> : r.date ? <DayChip>{dayText(r.date, now)}</DayChip> : undefined}
              />
            );
          })
        )}
      </div>
      <button type="button" className={styles.planDay} onClick={() => void plan()} disabled={busy}>
        <Zap size={18} strokeWidth={2} aria-hidden />
        Plan my day
      </button>
      {note && (
        <p className={styles.trayNote} role="status">
          {note}
        </p>
      )}
    </aside>
  );
}
