'use client';

// Calendar: a Notion page with a Calendar-layout database of everything
// dated: the Tasks database's tasks, Google Calendar events, project start
// and end dates and planned payments.
//   Properties: Calendar (the Google calendar's name), Sync (shown only
//   here), Showing (the sources on).
//   Toolbar: on the left a date range dropdown ("28 Sep to 4 Oct 2026")
//   and "Today"; on the right the view selector (Day, Week, Month as
//   views), filter (Source, Free tasks, Project, Area, Type), search, view
//   settings and New.
//   Large: a 260px left column with the mini calendar and a "Calendars"
//   checklist (Dreda tasks, Google, Project dates). Smaller screens keep
//   these in the date dropdown and the filter.
//   Medium: Day view by default (with a 7-day strip), Week with narrow
//   bars. Phones: Day (with the strip) or Month (dots, the tapped day's
//   list below); no Week.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { ALL_SOURCES, useLogic, type CalendarSources } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { dayFromIso, isoDay, mondayOf, shiftDay, weekRangeLabel, type CalItem } from '@/src/viewmodels/calendarItems';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ColumnBlocks, Column } from '@/src/widgets/Database/ColumnBlocks';
import { Database } from '@/src/widgets/Database/Database';
import type { ColumnDef, DefaultView, Layout } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { CalendarSyncStatus } from '@/src/widgets/CalendarSyncStatus/CalendarSyncStatus';
import { DateDropdown } from '@/src/widgets/TimeCalendar/DateDropdown';
import { DayStrip } from '@/src/widgets/TimeCalendar/DayStrip';
import { MiniCalendar } from '@/src/widgets/TimeCalendar/MiniCalendar';
import { MonthGrid } from '@/src/widgets/TimeCalendar/MonthGrid';
import { TimeGrid } from '@/src/widgets/TimeCalendar/TimeGrid';
import styles from './ProjectsCalendarScreen.module.css';

type Source = 'Dreda tasks' | 'Google' | 'Project dates';

interface CalRow extends CalItem {
  rowKey: string;
  iso: string;
  source: Source;
  area: string | null;
  type: string;
}

const VIEWS: DefaultView<CalRow>[] = [
  { id: 'week', name: 'Week', layout: 'week' },
  { id: 'day', name: 'Day', layout: 'day' },
  { id: 'month', name: 'Month', layout: 'month' },
];

const TYPE_OF: Record<CalItem['kind'], string> = { todo: 'Todo', meeting: 'Meeting', event: 'Event', google: 'Google event', project: 'Project date', payment: 'Payment' };

const COLUMNS: ColumnDef<CalRow>[] = [
  { id: 'title', label: 'Name', type: 'text', value: (r) => r.title },
  {
    id: 'source',
    label: 'Source',
    type: 'select',
    value: (r) => r.source,
    options: (['Dreda tasks', 'Google', 'Project dates'] as Source[]).map((s) => ({ value: s, label: s })),
  },
  { id: 'free', label: 'Free task', type: 'checkbox', value: (r) => r.source === 'Dreda tasks' && r.free },
  { id: 'project', label: 'Project', type: 'text', value: (r) => r.project },
  { id: 'area', label: 'Area', type: 'text', value: (r) => r.area },
  {
    id: 'type',
    label: 'Type',
    type: 'select',
    value: (r) => r.type,
    options: Object.values(TYPE_OF).map((t) => ({ value: t, label: t })),
  },
  { id: 'date', label: 'Date', type: 'date', value: (r) => dayFromIso(r.iso) },
];

export function ProjectsCalendarScreen() {
  const [sources, setSources] = useState<CalendarSources>(ALL_SOURCES);
  const logic = useLogic({ sources });
  const router = useRouter();
  const taskPanel = useTaskPanel();
  const { deviceClass } = useLayout();
  const compact = deviceClass === 'compact';
  const { selected, today, pick, range } = logic;

  // Every item in the loaded range, one row per day it's on.
  const areaOf = useMemo(() => new Map(logic.rows.map((r) => [r.id, r.areaName])), [logic.rows]);
  const rows = useMemo(() => {
    const out: CalRow[] = [];
    for (let d = new Date(range.from); d < range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = isoDay(d);
      for (const item of logic.itemsOn(iso)) {
        out.push({
          ...item,
          rowKey: `${iso}|${item.key}`,
          iso,
          source: item.taskId ? 'Dreda tasks' : item.kind === 'google' ? 'Google' : 'Project dates',
          area: item.taskId ? (areaOf.get(item.taskId) ?? null) : null,
          type: TYPE_OF[item.kind],
        });
      }
    }
    return out;
  }, [logic, range, areaOf]);

  function open(item: CalItem) {
    if (item.taskId) taskPanel.open(item.taskId);
    else if (item.href) router.push(item.href);
  }
  const newAt = (iso: string, minute?: number) =>
    taskPanel.open('new', minute === undefined ? { date: iso } : { date: iso, start: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` });

  function rangeLabel(layout: Layout) {
    const d = dayFromIso(selected);
    if (layout === 'day') return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (layout === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return weekRangeLabel(selected);
  }

  function render(layout: Layout, shown: CalRow[]) {
    const byDay = new Map<string, CalRow[]>();
    for (const r of shown) byDay.set(r.iso, [...(byDay.get(r.iso) ?? []), r]);
    const itemsOn = (iso: string) => byDay.get(iso) ?? [];
    if (layout === 'month') return <MonthGrid selected={selected} today={today} itemsOn={itemsOn} onOpen={open} onDay={(iso) => pick(iso)} compact={compact} />;
    const common = {
      itemsOn,
      today,
      onOpen: open,
      onEmpty: newAt,
      onMove: (item: CalItem, iso: string, startMin: number, endMin: number) => (item.taskId ? logic.scheduleAt(item.taskId, iso, startMin, endMin) : undefined),
      onDropTask: (id: string, iso: string, minute: number) => logic.scheduleAt(id, iso, minute),
      maxHeight: compact ? undefined : 'calc(100dvh - 300px)',
    };
    if (layout === 'week') {
      const monday = mondayOf(selected);
      return <TimeGrid mode="week" days={Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))} selected={selected} onPickDay={pick} barsBelow={deviceClass === 'medium' ? 90 : undefined} {...common} />;
    }
    return (
      <div className={styles.day}>
        {deviceClass !== 'large' && <DayStrip selected={selected} today={today} onPick={pick} countOf={(iso) => itemsOn(iso).length} scrollable={compact} />}
        <TimeGrid mode="day" days={[selected]} {...common} />
      </div>
    );
  }

  const showing = [sources.tasks && 'Tasks', sources.google && 'Google events', sources.projectDates && 'Project dates'].filter(Boolean).join(', ') || 'Nothing';

  const database = (
    <Database<CalRow>
      id="time.calendar"
      label="Calendar"
      noun={['item', 'items']}
      rows={rows}
      rowKey={(r) => r.rowKey}
      columns={COLUMNS}
      views={VIEWS}
      card={{ title: (r) => r.title }}
      extraLayouts={['day', 'week', 'month']}
      phoneLayouts={['day', 'month']}
      openView={deviceClass === 'medium' ? 'day' : null}
      renderLayout={(layout, shown) => render(layout, shown)}
      tabs={(view) => (
        <span className={styles.range}>
          <DateDropdown label={rangeLabel(view.layout)} selected={selected} today={today} onPick={pick} hasItems={logic.hasItems} className={styles.rangeButton} />
          {selected !== today && (
            <button type="button" className={styles.todayButton} onClick={logic.goToday}>
              Today
            </button>
          )}
        </span>
      )}
      onNew={() => newAt(selected)}
      emptyText="Nothing scheduled."
    />
  );

  return (
    <NotionPage
      title="Calendar"
      icon={<CalendarDays strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Calendar', href: '/projects/calendar' }]}
      properties={[
        { id: 'calendar', label: 'Calendar', display: logic.syncEnabled ? `Google: ${logic.calendarName ?? 'Primary calendar'}` : 'Google Calendar not connected' },
        ...(logic.syncEnabled ? [{ id: 'sync', label: 'Sync', display: <CalendarSyncStatus range={range} /> }] : []),
        { id: 'showing', label: 'Showing', display: showing },
      ]}
    >
      <ScreenState loading={logic.loading} />
      {deviceClass === 'large' ? (
        <ColumnBlocks template="260px minmax(0, 1fr)">
          <Column label="Month and calendars">
            <MiniCalendar selected={selected} today={today} onPick={pick} hasItems={logic.hasItems} />
            <section className={styles.calendars} aria-label="Calendars">
              <p className={styles.calendarsTitle}>Calendars</p>
              {(
                [
                  ['tasks', 'Dreda tasks', '#337ea9'],
                  ['google', 'Google', '#448361'],
                  ['projectDates', 'Project dates', '#9f6b53'],
                ] as [keyof CalendarSources, string, string][]
              ).map(([key, label, color]) => (
                <label key={key} className={styles.calendarRow}>
                  <input type="checkbox" checked={sources[key]} onChange={(e) => setSources((s) => ({ ...s, [key]: e.target.checked }))} style={{ accentColor: color }} />
                  {label}
                </label>
              ))}
              <label className={styles.calendarRow}>
                <input type="checkbox" checked={sources.freeTasks} disabled={!sources.tasks} onChange={(e) => setSources((s) => ({ ...s, freeTasks: e.target.checked }))} />
                Free tasks
              </label>
            </section>
          </Column>
          <Column label="Calendar">{database}</Column>
        </ColumnBlocks>
      ) : (
        database
      )}
    </NotionPage>
  );
}
