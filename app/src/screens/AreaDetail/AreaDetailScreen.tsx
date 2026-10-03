'use client';

// An area as a Notion page: its name, properties (Active projects, Open
// tasks, Description), then linked views of the Projects database (Gallery)
// and the Tasks database (List) filtered to this area, its sections, and
// a resources block.

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Map as MapIcon, Pencil } from 'lucide-react';
import { useLogic } from '@/src/logic/areaDetail/useLogic';
import { useProjectsDb, type ProjectRow } from '@/src/logic/projectsDb/useProjectsDb';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { Block, NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import type { DefaultView } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { projectCardSpec, projectColumns, projectGroups, projectListSpec } from '@/src/widgets/ProjectDb/projectDatabase';
import { taskCardSpec, taskColumns, taskGroups, taskListSpec, taskRowActions } from '@/src/widgets/TaskDb/taskDatabase';
import styles from './AreaDetailScreen.module.css';

const PROJECT_ALL = ['name', 'health', 'progress', 'dates', 'start', 'end', 'tasks', 'overdue', 'area', 'status', 'description', 'lastActivity'];
const PROJECT_VIEWS: DefaultView<ProjectRow>[] = [
  { id: 'gallery', name: 'Gallery', layout: 'cards', group: 'none', filter: (r) => r.status === 'Active', hidden: PROJECT_ALL.filter((id) => !['name', 'dates', 'description', 'health', 'tasks', 'overdue', 'progress'].includes(id)) },
  { id: 'table', name: 'Table', layout: 'table', group: 'none', hidden: ['area', 'description', 'dates'] },
];
const TASK_ALL = ['name', 'status', 'importance', 'priority', 'type', 'date', 'time', 'start', 'end', 'project', 'area', 'timeMode', 'recurring', 'overdue', 'sync', 'created', 'completed'];
const TASK_VIEWS: DefaultView<TaskRow>[] = [
  { id: 'list', name: 'List', layout: 'list', group: 'project', filter: (r) => r.status === 'Pending', hidden: TASK_ALL.filter((id) => !['name', 'date', 'time', 'importance', 'overdue'].includes(id)) },
  { id: 'table', name: 'Table', layout: 'table', group: 'none', hidden: ['priority', 'start', 'end', 'area', 'sync', 'created', 'completed', 'recurring'] },
];

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  const router = useRouter();
  const taskPanel = useTaskPanel();
  const { area, sections, openBucket, openNewBucket, loading, error } = useLogic(areaId);
  const { db, rows: allProjects } = useProjectsDb();
  const projects = allProjects.filter((p) => p.areaId === areaId);
  const tasks = useMemo(() => db.actionable.filter((r) => r.areaId === areaId), [db.actionable, areaId]);
  const projectCols = useMemo(() => projectColumns(), []);
  const taskCols = useMemo(() => taskColumns(db), [db]);
  const openProject = (r: ProjectRow) => router.push(`/projects/${r.id}`);

  if (loading || error || !area) return <ScreenState loading={loading} error={error ?? (loading ? null : 'This area no longer exists.')} />;

  const active = projects.filter((p) => p.status === 'Active');
  const open = tasks.filter((t) => t.status === 'Pending');

  return (
    <NotionPage
      title={area.name}
      icon={area.emoji ? <span>{area.emoji}</span> : <MapIcon strokeWidth={1.75} />}
      crumbs={[
        { label: 'Time', href: '/projects' },
        { label: 'Areas', href: '/areas' },
        { label: area.name, href: `/areas/${areaId}` },
      ]}
      actions={
        <Link href={`/areas/${areaId}/edit`} className={styles.ghost}>
          <Pencil size={14} strokeWidth={2} aria-hidden /> Edit
        </Link>
      }
      properties={[
        { id: 'projects', label: 'Active projects', display: String(active.length) },
        { id: 'tasks', label: 'Open tasks', display: String(open.length) },
        { id: 'description', label: 'Description', display: area.description || undefined, empty: !area.description },
      ]}
    >
      <Block title="Projects">
        <Database<ProjectRow>
          id="time.area.projects"
          label={`Projects in ${area.name}`}
          noun={['project', 'projects']}
          rows={projects}
          rowKey={(r) => r.id}
          columns={projectCols}
          views={PROJECT_VIEWS}
          groups={projectGroups().filter((g) => g.id !== 'area')}
          defaultGroup="none"
          card={projectCardSpec(openProject)}
          list={projectListSpec}
          onOpen={openProject}
          onNew={() => router.push(`/projects/new?areaId=${areaId}`)}
          emptyText="No projects in this area yet."
        />
      </Block>
      <Block title="Tasks">
        <Database<TaskRow>
          id="time.area.tasks"
          label={`Tasks in ${area.name}`}
          noun={['task', 'tasks']}
          rows={tasks}
          rowKey={(r) => r.id}
          columns={taskCols}
          views={TASK_VIEWS}
          groups={taskGroups()}
          defaultGroup="project"
          card={taskCardSpec(db)}
          list={taskListSpec(db, { withDate: true })}
          rowActions={taskRowActions(db)}
          onOpen={(r) => taskPanel.open(r.id)}
          emptyText="No open tasks in this area."
        />
      </Block>
      <Block
        title="Sections"
        actions={
          <button type="button" className={styles.ghost} onClick={openNewBucket}>
            New section
          </button>
        }
      >
        {sections.length === 0 ? (
          <p className={styles.muted}>No sections yet.</p>
        ) : (
          <ul className={styles.rows}>
            {sections.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => openBucket(s.id)}>
                  <span>{s.name}</span>
                  <span className={styles.muted}>
                    {s.projectCount} {s.projectCount === 1 ? 'project' : 'projects'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Resources">
        <p className={styles.muted}>Notes, links and files for this area will show here once Resources is ready.</p>
      </Block>
    </NotionPage>
  );
}
