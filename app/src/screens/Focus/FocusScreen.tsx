'use client';

// Focus: a Notion page over the Tasks database's pending tasks (and ones
// ticked today, which stay until tomorrow).
//   Properties: Scope, Overdue, Do first share of time. A callout only
//   when tasks are overdue, with "Show overdue".
//   Views (from the view selector, no tabs): Matrix (a board by
//   Importance: Do first, Schedule, Delegate, Eliminate), List (grouped by
//   Importance), Table, Overdue and This week. More can be added.
//   Matrix: each column's dot, name, count, hint and "..."; cards show the
//   date and time (red when overdue, with an "Overdue" tag) and the
//   project, never the importance their column already says; "+ New" at
//   the bottom of each column. Medium screens: a 2 by 2 grid; phones: one
//   quadrant at a time, cards move with "Move to".

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Target } from 'lucide-react';
import { useTasksDb } from '@/src/logic/tasksDb/useTasksDb';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { QUADRANT_BY_ID } from '@/src/viewmodels/eisenhower';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import type { Quadrant } from '@/src/shared/firestore/types';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import type { DefaultView } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskWhen, importanceDot, taskCardSpec, taskColumns, taskGroups, taskListSpec, taskRowActions } from '@/src/widgets/TaskDb/taskDatabase';

const ALL = ['name', 'status', 'importance', 'priority', 'type', 'date', 'time', 'start', 'end', 'project', 'area', 'timeMode', 'recurring', 'overdue', 'sync', 'created', 'completed'];
const showOnly = (ids: string[]) => ALL.filter((id) => !ids.includes(id));

function startOfWeek(now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

const VIEWS: DefaultView<TaskRow>[] = [
  { id: 'matrix', name: 'Matrix', layout: 'board', group: 'importance', hidden: showOnly(['name', 'date', 'project', 'overdue']) },
  { id: 'list', name: 'List', layout: 'list', group: 'importance', hidden: showOnly(['name', 'date', 'time', 'project', 'overdue']) },
  { id: 'table', name: 'Table', layout: 'table', group: 'none', hidden: showOnly(['name', 'importance', 'status', 'date', 'time', 'project', 'area', 'timeMode', 'overdue', 'recurring']) },
  { id: 'overdue', name: 'Overdue', layout: 'list', group: 'importance', filter: (r) => r.overdue, hidden: showOnly(['name', 'date', 'time', 'project', 'importance']) },
  {
    id: 'week',
    name: 'This week',
    layout: 'list',
    group: 'importance',
    filter: (r) => {
      const from = startOfWeek(new Date());
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
      return r.date !== null && r.date >= from && r.date < to;
    },
    hidden: showOnly(['name', 'date', 'time', 'project', 'overdue']),
  },
];

export function FocusScreen() {
  // ?view=overdue opens a view; reading the URL needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <FocusPage />
    </Suspense>
  );
}

function FocusPage() {
  const db = useTasksDb();
  const taskPanel = useTaskPanel();
  const params = useSearchParams();
  const openView = params.get('view');

  const rows = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return db.actionable.filter((r) => r.status === 'Pending' || (r.status === 'Done' && (!r.completed || r.completed >= todayStart)));
  }, [db.actionable]);

  const pending = rows.filter((r) => r.status === 'Pending');
  const overdue = pending.filter((r) => r.overdue);
  const overdueDoFirst = overdue.filter((r) => r.importance === 'do').length;
  const scheduled = pending.filter((r) => r.minutes > 0);
  const totalMinutes = scheduled.reduce((s, r) => s + r.minutes, 0);
  const doFirstShare = totalMinutes ? Math.round((scheduled.filter((r) => r.importance === 'do').reduce((s, r) => s + r.minutes, 0) / totalMinutes) * 100) : null;

  // Cards and rows show the date and time together (red when overdue).
  const columns = useMemo(
    () => taskColumns(db).map((c) => (c.id === 'date' ? { ...c, onCard: true, render: (r: TaskRow) => <TaskWhen row={r} withDate /> } : c)),
    [db]
  );
  const groups = useMemo(() => taskGroups(), []);

  return (
    <NotionPage
      title="Focus"
      icon={<Target strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Focus', href: '/projects/focus' }]}
      properties={[
        { id: 'scope', label: 'Scope', display: 'Pending tasks' },
        {
          id: 'overdue',
          label: 'Overdue',
          tone: overdue.length ? 'bad' : 'neutral',
          display: overdue.length ? <Link href="/projects/focus?view=overdue">{overdue.length}</Link> : '0',
        },
        { id: 'share', label: 'Do first share of time', display: doFirstShare === null ? 'No scheduled time yet' : `${doFirstShare}%` },
      ]}
    >
      <ScreenState loading={db.loading} />
      {overdue.length > 0 && (
        <Callout tone="watch" icon={<AlertTriangle size={18} strokeWidth={2} />}>
          <p>
            {overdue.length === 1 ? '1 task is overdue' : `${overdue.length} tasks are overdue`}
            {overdueDoFirst > 0 ? `, ${overdueDoFirst === overdue.length ? (overdue.length === 1 ? 'in Do first' : 'all in Do first') : `${overdueDoFirst} of them in Do first`}` : ''}.{' '}
            <Link href="/projects/focus?view=overdue">Show overdue</Link>
          </p>
        </Callout>
      )}
      <Database<TaskRow>
        key={openView ?? 'default'}
        id="time.focus"
        label="Focus"
        noun={['task', 'tasks']}
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        views={VIEWS}
        openView={openView}
        groups={groups}
        defaultGroup="importance"
        card={taskCardSpec(db)}
        list={taskListSpec(db, { withDate: true })}
        board={{
          group: 'importance',
          onMove: (r, to) => db.actions.setImportance(r, to as Quadrant),
          hint: (key) => (key in QUADRANT_BY_ID ? QUADRANT_BY_ID[key as Quadrant].hint : null),
          dot: importanceDot,
          matrix: true,
          fill: true,
          actions: taskRowActions(db),
        }}
        rowActions={taskRowActions(db)}
        onOpen={(r) => taskPanel.open(r.id)}
        onNew={(groupKey) => taskPanel.open('new', groupKey && groupKey in QUADRANT_BY_ID ? { quadrant: groupKey } : undefined)}
        emptyText="No pending tasks. Nice."
      />
    </NotionPage>
  );
}
