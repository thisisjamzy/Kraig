'use client';

// Today (Dreda v1.0 `Today / Web` 54460): the day at a glance.
//   Title: the date written out; under it "4 blocks, 5 h free, 3 tasks
//   overdue". Top bar: Plan the week (the Calendar) beside New task.
//   Left: The day, an hour grid of today's blocks with the now line.
//   Right: Now (the block under way, on dark ink with lime: Mark done,
//   Add 15 min, what is next), Overdue (red text and a red dot, never a red
//   block; Move to today) and To plan (tasks with no time block; Plan my
//   day puts them into today's free time). Cards drag onto the grid.
//   Medium screens: one column, Now and the lists above the day.
// Keys (with a mouse): left and right change day, T today, N new task.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useLogic, type TimeCalendarLogic } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { dayFromIso, shiftDay, type CalItem } from '@/src/viewmodels/calendarItems';
import { labelHue } from '@/src/viewmodels/projects';
import { dayText, durationText, lateText, minuteText, rangeText } from '@/src/viewmodels/todayPlan';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TimeGrid } from '@/src/widgets/TimeCalendar/TimeGrid';
import { DayChip, LatePill, TaskTrayCard } from '@/src/widgets/TaskChips/TaskTrayCard';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import { BookingRequest } from '@/src/widgets/SchedulingLinks/BookingRequest';
import styles from './TodayScreen.module.css';

const SHOWN = 2;

function longDate(iso: string) {
  const d = dayFromIso(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
}

export function TodayScreen() {
  const logic = useLogic();
  const { deviceClass, finePointer } = useLayout();
  const taskPanel = useTaskPanel();
  const { selected, today, pick } = logic;
  const isToday = selected === today;
  const wide = deviceClass === 'large' || deviceClass === 'expanded';

  const timed = logic.itemsOn(selected).filter((i) => !i.allDay && (i.start || i.end));
  const free = logic.freeOn(selected);
  const overdue = logic.overdue.length;
  const sub = [
    `${timed.length} ${timed.length === 1 ? 'block' : 'blocks'}`,
    `${durationText(free)} free`,
    ...(overdue > 0 ? [`${overdue} ${overdue === 1 ? 'task' : 'tasks'} overdue`] : []),
  ].join(', ');

  // Keyboard: left and right change day, T today, N new task.
  useEffect(() => {
    if (!finePointer) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[data-panel-open], [role="dialog"]')) return;
      if (e.key === 'ArrowLeft') pick(shiftDay(selected, -1));
      else if (e.key === 'ArrowRight') pick(shiftDay(selected, 1));
      else if (e.key === 't' || e.key === 'T') pick(today);
      else if (e.key === 'n' || e.key === 'N') taskPanel.open('new', { date: selected });
      else return;
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finePointer, selected, today, pick, taskPanel]);

  const [bookingId, setBookingId] = useState<string | null>(null);
  const opened = bookingId ? logic.bookingOf(bookingId) : null;

  function open(item: CalItem) {
    if (item.bookingId) setBookingId(item.bookingId);
    else if (item.taskId) taskPanel.open(item.taskId);
    else if (item.href) window.location.assign(item.href);
  }

  const day = (
    <section className={styles.dayCard} aria-label="The day">
      <div className={styles.dayHead}>
        <h2 className={styles.dayTitle}>{isToday ? 'The day' : longDate(selected)}</h2>
        <span className={styles.dayMeta}>
          {timed.length} {timed.length === 1 ? 'block' : 'blocks'}, {durationText(free)} free
        </span>
      </div>
      <TimeGrid
        mode="day"
        days={[selected]}
        itemsOn={(iso) => logic.itemsOn(iso)}
        today={today}
        onOpen={open}
        onEmpty={(iso, minute) => taskPanel.open('new', { date: iso, start: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` })}
        onMove={(item, iso, startMin, endMin) => (item.taskId ? logic.scheduleAt(item.taskId, iso, startMin, endMin) : undefined)}
        onDropTask={(id, iso, minute) => logic.scheduleAt(id, iso, minute)}
        hourHeight={70}
        maxHeight={wide ? 'calc(100dvh - 250px)' : undefined}
      />
    </section>
  );

  const side = (
    <>
      {isToday && <NowCard logic={logic} />}
      <PlanLists logic={logic} />
    </>
  );

  return (
    <NotionPage title={longDate(selected)} sub={sub} crumbs={[{ label: 'Today', href: '/projects' }]}>
      <ScreenState loading={logic.loading} />
      <TopBarControls>
        {!isToday && (
          <button type="button" className={styles.headerButton} onClick={logic.goToday}>
            Today
          </button>
        )}
        <Link href="/projects/calendar" className={styles.headerButton}>
          Plan the week
        </Link>
      </TopBarControls>
      {wide ? (
        <div className={styles.columns}>
          {day}
          <div className={styles.side}>{side}</div>
        </div>
      ) : (
        <div className={styles.stack}>
          {side}
          {day}
        </div>
      )}
      {opened && <BookingRequest booking={opened.booking} link={opened.link} onAnswer={(a) => logic.answerBooking(opened.booking.id, a)} onClose={() => setBookingId(null)} />}
    </NotionPage>
  );
}

/** The block under way now, else the next one today, on dark ink. */
function NowCard({ logic }: { logic: TimeCalendarLogic }) {
  const minute = useNowMinute();
  const taskPanel = useTaskPanel();
  const [error, setError] = useState<string | null>(null);
  const now = minute * 60000;
  const nowDate = new Date(now);
  const timed = logic
    .itemsOn(logic.today)
    .filter((i) => !i.allDay && i.start && !i.done)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const current = timed.find((i) => i.start!.getTime() <= now && (i.end?.getTime() ?? i.start!.getTime()) > now);
  const later = timed.filter((i) => i.start!.getTime() > now);
  const item = current ?? later[0];
  if (!item) return null;
  const next = current ? later[0] : later[1];
  const row = item.taskId ? logic.tasksOn(logic.today).find((r) => r.id === item.taskId) : undefined;
  const left = current && item.end ? Math.max(0, Math.round((item.end.getTime() - now) / 60000)) : null;
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    }
  }

  return (
    <section className={styles.nowCard} aria-label={current ? 'Now' : 'Next'}>
      <p className={styles.nowLabel}>
        {current ? 'Now' : 'Next'} · {current ? minuteText(nowMin) : minuteText(item.start!.getHours() * 60 + item.start!.getMinutes())}
      </p>
      <button type="button" className={styles.nowTitle} onClick={() => (item.taskId ? taskPanel.open(item.taskId) : item.href && window.location.assign(item.href))}>
        {item.title}
      </button>
      <p className={styles.nowMeta}>
        {row?.projectName && <HueTag hue={labelHue(row.projectColor)}>{row.projectName}</HueTag>}
        <span>{rangeText(item.start!, item.end)}</span>
        {left !== null && (
          <>
            <span aria-hidden>·</span>
            <span>{durationText(left)} left</span>
          </>
        )}
      </p>
      <div className={styles.nowActions}>
        {row && (
          <button type="button" className={styles.nowDone} onClick={() => void run(() => logic.db.actions.setStatus(row, 'Done'))}>
            <Check size={18} strokeWidth={2.5} aria-hidden />
            Mark done
          </button>
        )}
        {row && current && (
          <button type="button" className={styles.nowMore} onClick={() => void run(() => logic.extend(row.id, 15))}>
            Add 15 min
          </button>
        )}
        {next && (
          <span className={styles.nowNext}>
            Next: {next.title}, {minuteText(next.start!.getHours() * 60 + next.start!.getMinutes())}
          </span>
        )}
      </div>
      {error && (
        <p className={styles.nowError} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Overdue, then To plan: cards that drag onto the day. */
function PlanLists({ logic }: { logic: TimeCalendarLogic }) {
  const taskPanel = useTaskPanel();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const now = new Date();
  const { overdue, toPlan } = logic;

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setNote(null);
    try {
      setNote(await action());
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (overdue.length === 0 && toPlan.length === 0) {
    return (
      <section className={styles.listsCard} aria-label="To plan">
        <p className={styles.empty}>Nothing overdue and nothing left to plan.</p>
      </section>
    );
  }

  return (
    <section className={styles.listsCard} aria-label="Overdue and to plan">
      {overdue.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHead}>
            <h2 className={styles.listTitle} data-tone="danger">
              Overdue <span className={styles.count}>{overdue.length}</span>
            </h2>
            <button
              type="button"
              className={styles.textButton}
              disabled={busy}
              onClick={() => void run(async () => (await logic.moveToToday(overdue), `Moved ${overdue.length} to today.`))}
            >
              Move to today
            </button>
          </div>
          {overdue.slice(0, SHOWN).map((r) => (
            <TaskTrayCard key={r.id} row={r} onOpen={() => taskPanel.open(r.id)} right={<LatePill>{lateText(r.date, now) ?? 'Late'}</LatePill>} />
          ))}
          {overdue.length > SHOWN && (
            <Link href="/tasks" className={styles.moreLink}>
              {overdue.length - SHOWN} more in Tasks
            </Link>
          )}
        </div>
      )}
      {toPlan.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHead}>
            <h2 className={styles.listTitle}>
              To plan <span className={styles.count}>{toPlan.length}</span>
            </h2>
            <button
              type="button"
              className={styles.tonal}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const placed = await logic.planMyDay();
                  return placed === 0 ? 'No free time left today for these.' : `Planned ${placed} ${placed === 1 ? 'task' : 'tasks'} into today.`;
                })
              }
            >
              Plan my day
            </button>
          </div>
          {toPlan.slice(0, SHOWN).map((r) => (
            <TaskTrayCard key={r.id} row={r} onOpen={() => taskPanel.open(r.id)} right={r.date ? <DayChip>{dayText(r.date, now)}</DayChip> : undefined} />
          ))}
          {toPlan.length > SHOWN && (
            <Link href="/projects/calendar" className={styles.moreLink}>
              {toPlan.length - SHOWN} more in the tray
            </Link>
          )}
        </div>
      )}
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
    </section>
  );
}
