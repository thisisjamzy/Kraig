'use client';

// A project (Dreda v1.0 `Project detail` 64838).
//   Crumb: its folder (else its area). Title and its brief. Add note opens
//   Notes; New task adds a task to it.
//   Four stat cards: progress (health), open tasks, due, time blocked this
//   week. A view bar: Tasks (the table: time block, type, due, status),
//   Board (by status), Notes. Milestones show under the tasks when it has
//   any. About on the right (brief, folder, area, started), then Notes,
//   written in place.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, FileText, Layers, Sun } from 'lucide-react';
import { useLogic } from '@/src/logic/projectDetail/useLogic';
import { healthSentence } from '@/src/logic/projectsDb/useProjectsDb';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { actionableTasks } from '@/src/shared/tasks/recurringTasks';
import type { MilestoneStat } from '@/src/viewmodels/insights/metrics';
import { plural } from '@/src/viewmodels/organise';
import { durationText } from '@/src/viewmodels/todayPlan';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { Database } from '@/src/widgets/Database/Database';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { StatCards } from '@/src/widgets/Dashboard/StatCard';
import { TaskTable } from '@/src/widgets/TaskDb/TaskTable';
import { Tag, type TagColor } from '@/src/widgets/TaskDb/Tag';
import { taskCardSpec, taskColumns, taskGroups, taskListSpec, taskRowActions } from '@/src/widgets/TaskDb/taskDatabase';
import { HEALTH_HUE } from '@/src/widgets/ProjectDb/projectDatabase';
import { AboutCard, HeaderActions, longDate, SectionHead, TopBarActionsButton, ViewTabs } from '@/src/screens/Organise/parts';
import org from '@/src/screens/Organise/Organise.module.css';
import styles from './ProjectDetailScreen.module.css';

type View = 'tasks' | 'board' | 'notes';

const MILESTONE_COLOR: Record<MilestoneStat['state'], TagColor> = { done: 'green', 'on track': 'blue', 'at risk': 'yellow', missed: 'red' };
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MILESTONE_COLUMNS: ColumnDef<MilestoneStat>[] = [
  { id: 'name', label: 'Milestone', type: 'text', width: 240, value: (m) => m.milestone.name },
  { id: 'due', label: 'Due', type: 'date', width: 130, value: (m) => m.milestone.due },
  { id: 'state', label: 'State', type: 'select', width: 120, value: (m) => m.state, render: (m) => <Tag color={MILESTONE_COLOR[m.state]}>{sentence(m.state)}</Tag> },
  { id: 'tasks', label: 'Tasks', type: 'text', width: 110, value: (m) => (m.linked ? `${m.linkedDone} of ${m.linked} done` : null) },
  { id: 'forecast', label: 'Forecast', type: 'date', width: 130, value: (m) => m.forecast },
];

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const formLink = useFormLink();
  const taskPanel = useTaskPanel();
  const v = useLogic(projectId);
  const { o } = v;
  const { db } = o;
  const [view, setView] = useState<View>('tasks');
  const [archiving, setArchiving] = useState(false);
  const { row, stat, doc, tasks: listItems } = v;
  const boardRows = useMemo(() => {
    const now = new Date();
    return actionableTasks(
      db.taskDocs.filter((t) => t.projectId === projectId),
      now,
      { includeUpcoming: true }
    ).map((t) => db.toRow(t, now));
  }, [db, projectId]);
  const columns = useMemo(() => taskColumns(db).filter((c) => c.id !== 'project'), [db]);
  const groups = useMemo(() => taskGroups().filter((g) => g.id !== 'project'), []);

  if (o.loading) return <ScreenState loading />;
  if (!row || !doc || !stat) return <ScreenState error="This project no longer exists." />;

  const now = new Date();
  const daysLeft = row.end ? Math.ceil((row.end.getTime() - now.getTime()) / 86_400_000) : null;
  const crumbs = stat.folderId && stat.folderName ? [{ label: stat.folderName, href: `/sections/${stat.folderId}` }, { label: row.name }] : stat.areaId ? [{ label: stat.areaName ?? 'Area', href: `/areas/${stat.areaId}` }, { label: row.name }] : [{ label: 'Projects', href: '/projects/all' }, { label: row.name }];
  const { notes, saveNotes } = v;

  return (
    <NotionPage
      title={row.name}
      sub={row.description || healthSentence(row)}
      crumbs={crumbs}
      menu={[
        { label: 'Project settings', href: formLink('project', { id: projectId }) },
        { label: 'Open project insights', href: `/projects/insights/${projectId}` },
        { label: 'Archive project', onSelect: () => setArchiving(true) },
      ]}
    >
      <TopBarSecondaryNote onClick={() => setView('notes')} hasNotes={notes.trim() !== ''} />
      <HeaderActions primary={{ label: 'New task', href: taskPanel.hrefFor('new', { projectId }) }} />
      <StatCards
        stats={[
          { label: 'Progress', icon: <Check size={18} />, value: `${Math.round(stat.progress * 100)}%`, chip: { text: row.health, hue: HEALTH_HUE[row.health] }, caption: `${stat.done} of ${stat.total} done`, href: `/projects/insights/${projectId}` },
          { label: 'Open tasks', icon: <Layers size={18} />, value: String(stat.open), chip: stat.overdue ? { text: `${stat.overdue} overdue`, hue: 'rose' } : null, caption: `${stat.dueWeek} due this week` },
          {
            label: 'Due',
            icon: <CalendarDays size={18} />,
            value: row.end ? row.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date',
            chip: row.end ? { text: row.end.toLocaleDateString('en-GB', { weekday: 'short' }), hue: 'grey' } : null,
            caption: daysLeft === null ? 'set one in settings' : daysLeft >= 0 ? `${plural(daysLeft, 'day')} left` : `${plural(-daysLeft, 'day')} late`,
          },
          { label: 'Time blocked', icon: <Sun size={18} />, value: durationText(stat.weekMinutes), caption: 'this week', href: '/projects/calendar' },
        ]}
      />
      <div className={org.viewBar}>
        <ViewTabs<View>
          tabs={[
            { id: 'tasks', label: 'Tasks', icon: <Check size={16} aria-hidden /> },
            { id: 'board', label: 'Board', icon: <Layers size={16} aria-hidden /> },
            { id: 'notes', label: 'Notes', icon: <FileText size={16} aria-hidden /> },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <div className={org.split}>
        <div className={org.main}>
          {view === 'tasks' && (
            <>
              <SectionHead title="Tasks" meta={`Sorted by due date · ${stat.open} open`} />
              {listItems.length === 0 ? (
                <p className={org.empty}>
                  No tasks yet. <Link href={taskPanel.hrefFor('new', { projectId })} scroll={false}>Add the first one</Link>.
                </p>
              ) : (
                <TaskTable groups={[{ id: 'tasks', label: 'Tasks', tone: null, tasks: listItems }]} grouped={false} columns={['block', 'type', 'due', 'status']} onDone={o.setDone} />
              )}
              {row.milestones.length > 0 && (
                <>
                  <SectionHead title="Milestones" meta={plural(row.milestones.length, 'milestone')} />
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
                </>
              )}
            </>
          )}
          {view === 'board' && (
            <Database<TaskRow>
              id="time.project.board"
              label={`Tasks in ${row.name}`}
              noun={['task', 'tasks']}
              rows={boardRows}
              rowKey={(r) => r.id}
              columns={columns}
              views={[{ id: 'board', name: 'Board', layout: 'board', group: 'status' }]}
              groups={groups}
              defaultGroup="status"
              card={taskCardSpec(db)}
              list={taskListSpec(db, { withDate: true })}
              board={{ group: 'status', onMove: (r, to) => db.actions.setStatus(r, to as TaskRow['status']), actions: taskRowActions(db) }}
              rowActions={taskRowActions(db)}
              onOpen={(r) => taskPanel.open(r.id)}
              onNew={() => taskPanel.open('new', { projectId })}
              emptyText="No tasks yet."
            />
          )}
          {view === 'notes' && (
            <section className={org.sideCard} aria-label="Notes">
              <h2 className={org.sideTitle}>Notes</h2>
              <ProjectNotes key={projectId} value={notes} onSave={saveNotes} rows={14} />
            </section>
          )}
        </div>
        <div className={org.side}>
          <AboutCard
            text={row.description}
            editHref={formLink('project', { id: projectId })}
            rows={[
              ...(stat.folderName ? ([['Folder', <Link key="f" href={`/sections/${stat.folderId}`}>{stat.folderName}</Link>]] as [string, React.ReactNode][]) : []),
              ...(stat.areaName ? ([['Area', <Link key="a" href={`/areas/${stat.areaId}`}>{stat.areaName}</Link>]] as [string, React.ReactNode][]) : []),
              ['Priority', stat.priorityText.replace(' priority', '')],
              ...(row.start ? ([['Started', longDate(row.start)]] as [string, React.ReactNode][]) : []),
            ]}
          />
          {view !== 'notes' && (
            <section className={org.sideCard} aria-label="Notes">
              <div className={org.sideHead}>
                <h2 className={org.sideTitle}>Notes</h2>
                <button type="button" className={org.textButton} onClick={() => setView('notes')}>
                  {notes.trim() ? 'Open' : 'Add note'}
                </button>
              </div>
              {notes.trim() ? <p className={styles.notePreview}>{notes}</p> : <p className={org.empty}>Nothing written yet.</p>}
            </section>
          )}
        </div>
      </div>
      {archiving && (
        <ConfirmDialog
          tone="neutral"
          title={`Archive ${row.name}?`}
          message="It moves to the Archive in Library with all its tasks. Restore it from there any time, or delete it for good."
          confirmLabel="Archive"
          cancelLabel="Cancel"
          onCancel={() => setArchiving(false)}
          onConfirm={() => void v.archive()}
        />
      )}
    </NotionPage>
  );
}

/** Add note, beside New task: opens Notes. */
function TopBarSecondaryNote({ onClick, hasNotes }: { onClick: () => void; hasNotes: boolean }) {
  return (
    <TopBarActionsButton onClick={onClick}>
      <FileText size={20} strokeWidth={2} aria-hidden />
      {hasNotes ? 'Notes' : 'Add note'}
    </TopBarActionsButton>
  );
}

function ProjectNotes({ value, onSave, rows = 4 }: { value: string; onSave: (notes: string) => unknown; rows?: number }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      className={styles.notes}
      value={text}
      placeholder="Write anything about this project"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && void onSave(text)}
      rows={rows}
    />
  );
}
