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
import { Activity } from 'lucide-react';
import { healthSentence, useProjectsDb, type ProjectRow } from '@/src/logic/projectsDb/useProjectsDb';
import { taskItem } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { projectRef } from '@/src/shared/firestore/refs';
import { actionableTasks } from '@/src/shared/tasks/recurringTasks';
import { isoDay } from '@/src/viewmodels/calendarItems';
import type { MilestoneStat } from '@/src/viewmodels/insights/metrics';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import type { ProjectStatus } from '@/src/shared/firestore/types';
import { Block, Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { ColumnBlocks, Column } from '@/src/widgets/Database/ColumnBlocks';
import { Database } from '@/src/widgets/Database/Database';
import type { ColumnDef, DefaultView } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { MonthGrid } from '@/src/widgets/TimeCalendar/MonthGrid';
import { Tag, type TagColor } from '@/src/widgets/TaskDb/Tag';
import { taskCardSpec, taskColumns, taskGroups, taskListSpec, taskRowActions } from '@/src/widgets/TaskDb/taskDatabase';
import { HealthTag, ProgressBar, dateRange } from '@/src/widgets/ProjectDb/projectDatabase';
import styles from './ProjectDetailScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useRouter } from 'next/navigation';

const ALL = ['name', 'status', 'importance', 'priority', 'type', 'date', 'time', 'start', 'end', 'project', 'area', 'timeMode', 'recurring', 'overdue', 'sync', 'created', 'completed'];
const showOnly = (ids: string[]) => ALL.filter((id) => !ids.includes(id));
const TASK_VIEWS: DefaultView<TaskRow>[] = [
  { id: 'board', name: 'Board', layout: 'board', group: 'status', hidden: showOnly(['name', 'date', 'importance', 'overdue']) },
  { id: 'list', name: 'List', layout: 'list', group: 'status', hidden: showOnly(['name', 'date', 'time', 'importance', 'overdue']), collapsed: ['Done', 'Cancelled'] },
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
  const { db, rows, setDates, setStatus, loading } = useProjectsDb();
  const row = rows.find((r) => r.id === projectId) ?? null;
  const doc = db.projects.get(projectId);
  const [month, setMonth] = useState(() => isoDay(new Date()));

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

  const next = row.milestones.filter((m) => m.state !== 'done').sort((a, b) => a.milestone.due.getTime() - b.milestone.due.getTime())[0] ?? null;
  const areaOptions = db.areaDocs.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name }));
  const uid = db.uid;
  const setArea = async (areaId: string | null) => {
    if (uid) await updateDoc(projectRef(uid, projectId), { areaId, updatedAt: serverTimestamp() });
  };

  const side = (
    <>
      <section className={styles.panel} aria-label="Health">
        <p className={styles.panelTitle}>Health</p>
        <HealthTag health={row.health} />
        <p className={styles.muted}>{healthSentence(row)}</p>
      </section>
      <section className={styles.panel} aria-label="Progress">
        <p className={styles.panelTitle}>Progress</p>
        <ProgressBar row={row} />
        <p className={styles.muted}>
          {row.done} of {row.tasks} tasks done{row.overdue ? `, ${row.overdue} overdue` : ''}
        </p>
      </section>
      <section className={styles.panel} aria-label="Next milestone">
        <p className={styles.panelTitle}>Next milestone</p>
        {next ? (
          <>
            <p className={styles.strong}>{next.milestone.name}</p>
            <p className={styles.muted}>
              Due {longDate(next.milestone.due)} · <Tag color={MILESTONE_COLOR[next.state]}>{sentence(next.state)}</Tag>
            </p>
          </>
        ) : (
          <p className={styles.muted}>No milestones left</p>
        )}
      </section>
    </>
  );

  const main = (
    <>
      <Callout icon={<Activity size={18} strokeWidth={2} />} tone={row.health === 'At risk' ? 'bad' : row.health === 'Watch' ? 'watch' : row.health === 'On track' || row.health === 'Done' ? 'good' : undefined}>
        <p>{healthSentence(row)}</p>
      </Callout>
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
        { label: 'Open project insights', href: `/projects/insights/${projectId}` },
        { label: 'Edit project', href: formLink('project', { id: projectId }) },
      ]}
      properties={[
        {
          id: 'status',
          label: 'Status',
          edit: {
            type: 'select',
            value: row.status,
            options: ['Active', 'Completed', 'Archived'].map((s) => ({ value: s, label: s })),
            onSave: (v) => setStatus(row, v as ProjectStatus),
          },
        },
        { id: 'health', label: 'Health', tone: row.health === 'At risk' ? 'bad' : row.health === 'Watch' ? 'watch' : 'good', display: row.health, sub: row.reasons[0] },
        {
          id: 'area',
          label: 'Area',
          display: row.areaName ? <Link href={`/areas/${row.areaId}`}>{row.areaName}</Link> : undefined,
          empty: !row.areaName,
          edit: { type: 'relation', value: row.areaId, options: [{ value: '', label: 'No area' }, ...areaOptions], onSave: (v) => setArea((v as string) || null) },
        },
        { id: 'dates', label: 'Dates', display: dateRange(row) ?? undefined, empty: !dateRange(row) },
        { id: 'deadline', label: 'Deadline', edit: { type: 'date', value: row.end, onSave: (v) => setDates(row, row.start, v instanceof Date ? v : null) } },
        { id: 'progress', label: 'Progress', progress: row.progress, sub: `${row.done} of ${row.tasks} tasks done` },
        {
          id: 'forecast',
          label: 'Forecast finish',
          tone: row.end && (!row.forecast || row.forecast > row.end) && row.health !== 'Done' ? 'watch' : 'neutral',
          display: row.forecast ? longDate(row.forecast) : 'No finish in sight yet',
          sub: row.end && row.forecast && row.slackDays !== null ? (row.slackDays >= 0 ? `${row.slackDays} days before the deadline` : `${-row.slackDays} days after the deadline`) : undefined,
        },
        { id: 'overdue', label: 'Overdue tasks', tone: row.overdue ? 'bad' : 'neutral', display: String(row.overdue) },
      ]}
    >
      {deviceClass === 'large' ? (
        <ColumnBlocks template="minmax(0, 1fr) 280px">
          <Column>{main}</Column>
          <Column sticky label="Project summary">
            {side}
          </Column>
        </ColumnBlocks>
      ) : (
        main
      )}
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
