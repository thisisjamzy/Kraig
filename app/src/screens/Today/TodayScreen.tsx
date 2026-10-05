'use client';

// Today: a Notion page about one selected date, on every screen size.
//   Title: the date written out ("Saturday, 3 October"). Properties: Date
//   (a dropdown with Today, Tomorrow and Yesterday), Tasks, Focus time,
//   Meetings, Overdue (links to Focus's Overdue view). A callout says the
//   day in a sentence or two.
//   Large and expanded: three columns. Left: mini month, progress, next
//   up. Center: a 7-day strip over the day timeline. Right: the day's
//   tasks, a linked view of the Tasks database (List, Table, Board by
//   Status), grouped by status with Done and Cancelled collapsed and the
//   day's date-only to-dos under "Anytime".
//   Medium: two columns; the right one switches between Tasks and Timeline.
//   Phones: one column; the progress block is one line under the callout,
//   the strip scrolls sideways, Tasks or Timeline below it.
// Dragging a task from the list onto the timeline schedules it (with the
// availability check); hovering a row rings its block and back. Keys (with
// a mouse): left and right change day, T today, N new task.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Sun, Users } from 'lucide-react';
import { useLogic } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { dayFromIso, shiftDay, type CalItem } from '@/src/viewmodels/calendarItems';
import { hoursText, type TaskRow } from '@/src/viewmodels/taskRow';
import { dayFigures, daySentence, progressLine } from '@/src/viewmodels/todaySummary';
import { Block, Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { ColumnBlocks, Column } from '@/src/widgets/Database/ColumnBlocks';
import { Database } from '@/src/widgets/Database/Database';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { DateDropdown } from '@/src/widgets/TimeCalendar/DateDropdown';
import { DayStrip } from '@/src/widgets/TimeCalendar/DayStrip';
import { MiniCalendar } from '@/src/widgets/TimeCalendar/MiniCalendar';
import { TASK_DRAG_TYPE, TimeGrid } from '@/src/widgets/TimeCalendar/TimeGrid';
import { taskCardSpec, taskColumns, taskGroups, taskListSpec, taskRowActions, ModeGlyph } from '@/src/widgets/TaskDb/taskDatabase';
import type { DefaultView } from '@/src/widgets/Database/types';
import styles from './TodayScreen.module.css';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';

type Logic = ReturnType<typeof useLogic>;

const LIST_HIDDEN = ['status', 'priority', 'type', 'date', 'start', 'end', 'area', 'timeMode', 'recurring', 'overdue', 'sync', 'created', 'completed'];
const TABLE_HIDDEN = ['priority', 'type', 'date', 'start', 'end', 'area', 'recurring', 'sync', 'created', 'completed'];
const VIEWS: DefaultView<TaskRow>[] = [
  { id: 'list', name: 'List', layout: 'list', group: 'status', hidden: LIST_HIDDEN, collapsed: ['Done', 'Cancelled'] },
  { id: 'table', name: 'Table', layout: 'table', group: 'status', hidden: TABLE_HIDDEN, collapsed: ['Done', 'Cancelled'] },
  { id: 'board', name: 'Board', layout: 'board', group: 'status', hidden: LIST_HIDDEN },
];

function longDate(iso: string) {
  const d = dayFromIso(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
}

export function TodayScreen() {
  const logic = useLogic();
  const { deviceClass, finePointer } = useLayout();
  const taskPanel = useTaskPanel();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pane, setPane] = useState<'tasks' | 'timeline'>('tasks');
  const { selected, today, pick, db } = logic;
  const compact = deviceClass === 'compact';
  const medium = deviceClass === 'medium';
  const isToday = selected === today;

  // The day's tasks; date-only to-dos of the day sit under Anytime.
  const dayRows = logic.tasksOn(selected);
  const figures = dayFigures(dayRows, logic.itemsOn(selected).filter((i) => i.kind === 'google' && i.meeting).length);
  const overdue = db.overdueEarlier.length;
  const sentence = daySentence({ figures, isToday, dayLabel: longDate(selected), overdue });

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

  const columns = useMemo(() => taskColumns(db), [db]);
  const groups = useMemo(() => taskGroups({ anytime: true }), []);

  function open(item: CalItem) {
    if (item.taskId) taskPanel.open(item.taskId);
    else if (item.href) window.location.assign(item.href);
  }

  const timeline = (
    <div className={styles.timeline}>
      <DayStrip selected={selected} today={today} onPick={pick} countOf={logic.countOn} scrollable={compact} />
      <TimeGrid
        mode="day"
        days={[selected]}
        itemsOn={(iso) => logic.itemsOn(iso)}
        today={today}
        onOpen={open}
        onEmpty={(iso, minute) => taskPanel.open('new', { date: iso, start: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` })}
        onMove={(item, iso, startMin, endMin) => (item.taskId ? logic.scheduleAt(item.taskId, iso, startMin, endMin) : undefined)}
        onDropTask={(id, iso, minute) => logic.scheduleAt(id, iso, minute)}
        highlight={highlight}
        onHover={setHighlight}
        maxHeight={compact ? undefined : 'calc(100dvh - 330px)'}
      />
    </div>
  );

  const tasks = (
    <Database<TaskRow>
      id="time.today.tasks"
      label={`Tasks on ${longDate(selected)}`}
      noun={['task', 'tasks']}
      rows={dayRows}
      rowKey={(r) => r.id}
      columns={columns}
      views={VIEWS}
      groups={groups}
      defaultGroup="status"
      card={taskCardSpec(db)}
      list={{
        ...taskListSpec(db, { highlight }),
        onHover: (r) => setHighlight(r?.id ?? null),
        drag: { type: TASK_DRAG_TYPE, data: (r) => r.id },
      }}
      board={{ group: 'status', onMove: (r, to) => (to === 'Anytime' ? undefined : db.actions.setStatus(r, to as TaskRow['status'])) }}
      rowActions={taskRowActions(db)}
      onOpen={(r) => taskPanel.open(r.id)}
      onNew={() => taskPanel.open('new', { date: selected })}
      newLabel="New"
      emptyText={isToday ? 'Nothing planned today.' : 'Nothing planned on this day.'}
    />
  );

  const left = (
    <>
      <MiniCalendar selected={selected} today={today} onPick={pick} hasItems={logic.hasItems} />
      <Progress figures={figures} overdue={overdue} rows={dayRows} />
      <NextUp logic={logic} />
    </>
  );

  const segmented = (
    <div className={styles.segmented} role="tablist" aria-label="Show">
      {(['tasks', 'timeline'] as const).map((p) => (
        <button key={p} type="button" role="tab" aria-selected={pane === p} onClick={() => setPane(p)}>
          {p === 'tasks' ? 'Tasks' : 'Timeline'}
        </button>
      ))}
    </div>
  );

  return (
    <NotionPage
      title={longDate(selected)}
      icon={<Sun strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Today', href: '/projects' }]}
      properties={[
        {
          id: 'date',
          label: 'Date',
          display: <DateDropdown label={isToday ? `Today, ${dayFromIso(selected).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : longDate(selected)} selected={selected} today={today} onPick={pick} hasItems={logic.hasItems} />,
        },
        { id: 'tasks', label: 'Tasks', display: `${figures.pending} pending`, sub: `${figures.done} done · ${figures.cancelled} cancelled` },
        { id: 'focus', label: 'Focus time', display: `${hoursText(figures.blockedMinutes)} blocked` },
        { id: 'meetings', label: 'Meetings', display: String(figures.meetings) },
        {
          id: 'overdue',
          label: 'Overdue',
          tone: overdue ? 'bad' : 'neutral',
          display: overdue ? (
            <Link href="/projects/focus?view=overdue" className={styles.overdueLink}>
              {overdue}
            </Link>
          ) : (
            '0'
          ),
        },
      ]}
    >
      <ScreenState loading={logic.loading} />
      <Callout icon={<CalendarDays size={18} strokeWidth={2} />} tone={overdue > 0 ? 'watch' : undefined}>
        <p>
          {sentence}
          {overdue > 0 && (
            <>
              {' '}
              <Link href="/projects/focus?view=overdue">Review overdue</Link>
            </>
          )}
          <NotificationsLink module="time" about="your time" />
        </p>
        {compact && <p className={styles.progressLine}>{progressLine(figures, overdue)}</p>}
      </Callout>

      {compact ? (
        <>
          {segmented}
          {pane === 'tasks' ? tasks : timeline}
        </>
      ) : medium ? (
        <ColumnBlocks template="minmax(260px, 300px) minmax(0, 1fr)">
          <Column label="Month and day summary">{left}</Column>
          <Column label="Tasks and timeline">
            {segmented}
            {pane === 'tasks' ? tasks : timeline}
          </Column>
        </ColumnBlocks>
      ) : (
        <ColumnBlocks template={deviceClass === 'large' ? '300px minmax(0, 1fr) 380px' : '260px minmax(0, 1fr) 340px'}>
          <Column label="Month and day summary">{left}</Column>
          <Column label="Day timeline">{timeline}</Column>
          <Column label="Tasks for this day">
            <Block title="Tasks">{tasks}</Block>
          </Column>
        </ColumnBlocks>
      )}
    </NotionPage>
  );
}

function Progress({ figures, overdue, rows }: { figures: ReturnType<typeof dayFigures>; overdue: number; rows: TaskRow[] }) {
  const live = rows.filter((r) => r.status !== 'Cancelled');
  const share = figures.total ? figures.done / figures.total : 0;
  return (
    <section className={styles.panel} aria-label="Progress">
      <p className={styles.panelTitle}>
        {figures.done} of {figures.total} done
      </p>
      <span className={styles.bar} aria-hidden>
        <span style={{ width: `${share * 100}%` }} />
      </span>
      {live.length > 0 && (
        <span className={styles.dots} aria-hidden>
          {live.map((r) => (
            <span key={r.id} data-done={r.done || undefined} />
          ))}
        </span>
      )}
      <div className={styles.figures}>
        <span>
          <strong>{hoursText(figures.blockedMinutes)}</strong> blocked
        </span>
        <span>
          <strong>{figures.meetings}</strong> {figures.meetings === 1 ? 'meeting' : 'meetings'}
        </span>
        <span data-alert={overdue > 0 || undefined}>
          <strong>{overdue}</strong> overdue
        </span>
      </div>
    </section>
  );
}

function NextUp({ logic }: { logic: Logic }) {
  const minute = useNowMinute();
  const taskPanel = useTaskPanel();
  const isToday = logic.selected === logic.today;
  const now = minute * 60000;
  const items = logic
    .itemsOn(logic.selected)
    .filter((i) => !i.allDay && i.start && !i.done && (!isToday || i.start.getTime() >= now - 5 * 60000))
    .sort((a, b) => a.start!.getTime() - b.start!.getTime())
    .slice(0, 3);
  const rows = new Map(logic.tasksOn(logic.selected).map((r) => [r.id, r]));
  return (
    <section className={styles.panel} aria-label="Next up">
      <p className={styles.panelTitle}>Next up</p>
      {items.length === 0 ? (
        <p className={styles.muted}>{isToday ? 'Nothing else scheduled today' : 'Nothing scheduled'}</p>
      ) : (
        <ul className={styles.nextList}>
          {items.map((i) => {
            const row = i.taskId ? rows.get(i.taskId) : undefined;
            return (
              <li key={i.key}>
                <span className={styles.nextTime}>{i.start!.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={styles.nextIcon} data-kind={i.kind} aria-hidden>
                  {i.meeting ? <Users size={13} strokeWidth={2} /> : <CalendarDays size={13} strokeWidth={2} />}
                </span>
                <button type="button" className={styles.nextTitle} onClick={() => (i.taskId ? taskPanel.open(i.taskId) : i.href && window.location.assign(i.href))}>
                  {i.title}
                </button>
                {row && !row.allDay && <ModeGlyph mode={row.timeMode} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
