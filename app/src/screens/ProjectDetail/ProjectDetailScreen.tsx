'use client';

// A project as a Notion page.
//   Title with its color dot (or emoji). Properties: Status, Health, Area,
//   Dates, Deadline, Progress, Forecast finish. A callout says why its
//   health is what it is ("Nothing done in 9 days; at this pace it won't
//   finish by 10 Oct.").
//   Its tasks: a linked view of the Tasks database filtered to this
//   project (Board by Status, List, Table, Calendar). Then milestones (a
//   small table) and notes (free text).
//   Large screens: a sticky right column with Health, Progress and the
//   next milestone. Medium and phones: one column.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { healthSentence, useProjectsDb, type ProjectRow } from '@/src/logic/projectsDb/useProjectsDb';
import { taskItem } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { projectRef } from '@/src/shared/firestore/refs';
import { actionableTasks } from '@/src/shared/tasks/recurringTasks';
import { isoDay } from '@/src/viewmodels/calendarItems';
import type { MilestoneStat } from '@/src/viewmodels/insights/metrics';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { Block, NotionPage } from '@/src/widgets/Database/NotionPage';
import { TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { Database } from '@/src/widgets/Database/Database';
import type { ColumnDef, DefaultView } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { MonthGrid } from '@/src/widgets/TimeCalendar/MonthGrid';
import { Tag, type TagColor } from '@/src/widgets/TaskDb/Tag';
import { taskCardSpec, taskColumns, taskGroups, taskListSpec, taskRowActions } from '@/src/widgets/TaskDb/taskDatabase';
import styles from './ProjectDetailScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useRouter } from 'next/navigation';

const ALL = ['name', 'status', 'importance', 'priority', 'type', 'date', 'time', 'start', 'end', 'project', 'area', 'timeMode', 'recurring', 'overdue', 'sync', 'created', 'completed'];
const showOnly = (ids: string[]) => ALL.filter((id) => !ids.includes(id));
const TASK_VIEWS: DefaultView<TaskRow>[] = [
  { id: 'list', name: 'List', layout: 'list', group: 'status', hidden: showOnly(['name', 'date', 'time', 'importance', 'overdue']), collapsed: ['Done', 'Cancelled'] },
  { id: 'board', name: 'Board', layout: 'board', group: 'status', hidden: showOnly(['name', 'date', 'importance', 'overdue']) },
  { id: 'table', name: 'Table', layout: 'table', group: 'none', hidden: showOnly(['name', 'status', 'importance', 'date', 'time', 'timeMode', 'overdue']) },
  { id: 'calendar', name: 'Calendar', layout: 'month', group: 'none' },
];

const MILESTONE_COLOR: Record<MilestoneStat['state'], TagColor> = { done: 'green', 'on track': 'blue', 'at risk': 'yellow', missed: 'red' };
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined);

const MILESTONE_COLUMNS: ColumnDef<MilestoneStat>[] = [
  { id: 'name', label: 'Milestone', type: 'text', width: 240, value: (m) => m.milestone.name },
  { id: 'due', label: 'Due', type: 'date', width: 130, value: (m) => m.milestone.due },
  { id: 'state', label: 'State', type: 'select', width: 120, value: (m) => m.state, render: (m) => <Tag color={MILESTONE_COLOR[m.state]}>{sentence(m.state)}</Tag> },
  { id: 'tasks', label: 'Tasks', type: 'text', width: 110, value: (m) => (m.linked ? `${m.linkedDone} of ${m.linked} done` : null) },
  { id: 'forecast', label: 'Forecast', type: 'date', width: 130, value: (m) => m.forecast },
];

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const formLink = useFormLink();
  const taskPanel = useTaskPanel();
  const { deviceClass } = useLayout();
  const { db, rows, loading } = useProjectsDb();
  const row = rows.find((r) => r.id === projectId) ?? null;
  const doc = db.projects.get(projectId);
  const [month, setMonth] = useState(() => isoDay(new Date()));
  const [nowMs] = useState(() => Date.now());

  const tasks = useMemo(() => {
    const now = new Date();
    return actionableTasks(
      db.taskDocs.filter((t) => t.projectId === projectId),
      now,
      { includeUpcoming: true }
    ).map((t) => db.toRow(t, now));
  }, [db, projectId]);
  const columns = useMemo(() => taskColumns(db).filter((c) => c.id !== 'project'), [db]);
  const groups = useMemo(() => taskGroups().filter((g) => g.id !== 'project'), []);

  if (loading) return <ScreenState loading />;
  if (!row || !doc) return <ScreenState error="This project no longer exists." />;

  const uid = db.uid;

  const main = (
    <>
      <Block title="Tasks">
        <Database<TaskRow>
          id="time.project.tasks"
          label={`Tasks in ${row.name}`}
          noun={['task', 'tasks']}
          rows={tasks}
          rowKey={(r) => r.id}
          columns={columns}
          views={TASK_VIEWS}
          groups={groups}
          defaultGroup="status"
          card={taskCardSpec(db)}
          list={taskListSpec(db, { withDate: true })}
          board={{ group: 'status', onMove: (r, to) => db.actions.setStatus(r, to as TaskRow['status']), actions: taskRowActions(db) }}
          rowActions={taskRowActions(db)}
          extraLayouts={['month']}
          renderLayout={(_, shown) => {
            const byDay = new Map<string, ReturnType<typeof taskItem>[]>();
            for (const r of shown) if (r.date) byDay.set(isoDay(r.date), [...(byDay.get(isoDay(r.date)) ?? []), taskItem(r)]);
            return (
              <MonthGrid
                selected={month}
                today={isoDay(new Date())}
                itemsOn={(iso) => byDay.get(iso) ?? []}
                onOpen={(i) => i.taskId && taskPanel.open(i.taskId)}
                onDay={setMonth}
                compact={deviceClass === 'compact'}
              />
            );
          }}
          onOpen={(r) => taskPanel.open(r.id)}
          onNew={() => taskPanel.open('new', { projectId })}
          newTemplates={[{ id: 'import', label: 'Import tasks', onSelect: () => router.push(formLink('import', { project: projectId })) }]}
          emptyText="No tasks yet."
        />
      </Block>
      <Block title="Project insights">
        <ProjectInsightsBlock tasks={tasks} row={row} />
        <Link href={`/projects/insights/${projectId}`} className={styles.more}>
          Open project insights
        </Link>
      </Block>
      {row.milestones.length > 0 && (
        <Block title="Milestones">
          <Database<MilestoneStat>
            id="time.project.milestones"
            label="Milestones"
            noun={['milestone', 'milestones']}
            rows={row.milestones}
            rowKey={(m) => m.milestone.id}
            columns={MILESTONE_COLUMNS}
            views={[{ id: 'table', name: 'Table', layout: 'table' }]}
            card={{ title: (m) => m.milestone.name }}
            emptyText="No milestones."
          />
        </Block>
      )}
      <Block title="Notes">
        <ProjectNotes key={projectId} value={doc.notes ?? ''} onSave={(notes) => uid && updateDoc(projectRef(uid, projectId), { notes, updatedAt: serverTimestamp() })} />
      </Block>
    </>
  );

  return (
    <NotionPage
      title={row.name}
      icon={doc.emoji ? <span>{doc.emoji}</span> : <span className={styles.iconDot} style={{ background: row.color }} aria-hidden />}
      crumbs={[
        { label: 'Time', href: '/projects' },
        { label: 'Projects', href: '/projects/all' },
        { label: row.name, href: `/projects/${projectId}` },
      ]}
      menu={[
        { label: 'Project settings', href: formLink('project', { id: projectId }) },
        { label: 'Open project insights', href: `/projects/insights/${projectId}` },
      ]}
      sub={[
        row.areaName ? `Project in ${row.areaName}` : 'Project',
        `${row.tasks} ${row.tasks === 1 ? 'task' : 'tasks'}, ${row.done} done`,
        row.end ? `due ${longDate(row.end)}` : null,
        row.health !== 'Done' ? healthSentence(row).replace(/\.$/, '') : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      properties={[
        { id: 'open', label: 'Open tasks', display: String(Math.max(0, row.tasks - row.done)) },
        { id: 'week', label: 'Due this week', display: String(tasks.filter((t) => !t.done && t.date && t.date.getTime() - nowMs < 7 * 86_400_000 && t.date.getTime() >= nowMs - 86_400_000).length) },
        { id: 'overdue', label: 'Overdue', tone: row.overdue ? 'bad' : 'neutral', display: String(row.overdue) },
        { id: 'progress', label: 'Progress', display: `${Math.round((row.progress ?? 0) * 100)}%`, sub: row.forecast ? `Forecast finish ${longDate(row.forecast)}` : undefined },
      ]}
    >
      <TopBarControls>
        <Link href={formLink('project', { id: projectId })} scroll={false} className={styles.headerButton}>
          Project settings
        </Link>
      </TopBarControls>
      {main}
    </NotionPage>
  );
}

function ProjectNotes({ value, onSave }: { value: string; onSave: (notes: string) => unknown }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      className={styles.notes}
      value={text}
      placeholder="Write anything about this project"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && void onSave(text)}
      rows={4}
    />
  );
}

/** A small summary after the tasks: completion this week, the overdue
 * trend and the forecast against the deadline. */
function ProjectInsightsBlock({ tasks, row }: { tasks: TaskRow[]; row: ProjectRow }) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const lastMonday = new Date(monday.getTime() - 7 * 86_400_000);
  const doneThisWeek = tasks.filter((t) => t.completed && t.completed >= monday).length;
  const doneLastWeek = tasks.filter((t) => t.completed && t.completed >= lastMonday && t.completed < monday).length;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const overdueNow = tasks.filter((t) => t.overdue).length;
  const overdueThen = tasks.filter((t) => {
    const end = t.end ?? t.start;
    if (!end || end >= weekAgo || t.status === 'Cancelled') return false;
    return t.status === 'Pending' || (t.completed !== null && t.completed > weekAgo);
  }).length;
  const forecast = !row.end
    ? 'No deadline set'
    : !row.forecast
      ? "Nothing done lately, so it won't finish on time at this pace"
      : row.slackDays !== null && row.slackDays >= 0
        ? `Finishes around ${longDate(row.forecast)}, ${row.slackDays} days early`
        : `Finishes around ${longDate(row.forecast)}, ${-(row.slackDays ?? 0)} days late`;
  return (
    <ul className={styles.insights}>
      <li>
        <span>Completed this week</span>
        <strong>{doneThisWeek}</strong>
        <em>{doneLastWeek ? `${doneLastWeek} last week` : 'None last week'}</em>
      </li>
      <li data-tone={overdueNow > overdueThen ? 'bad' : overdueNow < overdueThen ? 'good' : undefined}>
        <span>Overdue</span>
        <strong>{overdueNow}</strong>
        <em>{overdueNow === overdueThen ? 'Same as a week ago' : `${overdueThen} a week ago`}</em>
      </li>
      <li data-tone={row.end && row.forecast && (row.slackDays ?? 0) >= 0 ? 'good' : row.end ? 'watch' : undefined}>
        <span>Forecast vs deadline</span>
        <strong>{row.end ? longDate(row.end) : 'None'}</strong>
        <em>{forecast}</em>
      </li>
    </ul>
  );
}
