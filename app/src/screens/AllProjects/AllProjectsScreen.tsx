'use client';

// Projects: a Notion page over the Projects database.
//   Properties: Active, At risk, Overdue tasks. A callout when projects
//   are at risk, with "Show at risk".
//   Views: Gallery (cards grouped by area, the default), Table, Board (by
//   health), Timeline (bars from start to end, drag the ends to change
//   dates; not on phones) and At risk. Gallery, Board and Timeline show
//   active projects; Table shows every project (filter by Status).
//   Cards: 4 across on large screens, 3 expanded, 2 medium, 1 on phones.

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, FolderKanban } from 'lucide-react';
import { atRiskSentence, useProjectsDb, type ProjectRow } from '@/src/logic/projectsDb/useProjectsDb';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import type { DefaultView } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectTimeline } from '@/src/widgets/ProjectTimeline/ProjectTimeline';
import { TAG_ACCENT } from '@/src/widgets/TaskDb/Tag';
import { HEALTH_COLOR, healthAccent, projectCardSpec, projectColumns, projectGroups, projectListSpec } from '@/src/widgets/ProjectDb/projectDatabase';

const ALL = ['name', 'health', 'progress', 'dates', 'start', 'end', 'tasks', 'overdue', 'area', 'status', 'description', 'lastActivity'];
const showOnly = (ids: string[]) => ALL.filter((id) => !ids.includes(id));
const active = (r: ProjectRow) => r.status === 'Active';

const FILL: Record<string, string> = { red: '#ffe2dd', yellow: '#fdecc8', green: '#dbeddb', gray: '#e3e2e0' };

const VIEWS: DefaultView<ProjectRow>[] = [
  { id: 'gallery', name: 'Gallery', layout: 'cards', group: 'area', filter: active, hidden: showOnly(['name', 'dates', 'description', 'health', 'tasks', 'overdue', 'area', 'progress']) },
  { id: 'table', name: 'Table', layout: 'table', group: 'none', hidden: showOnly(['name', 'health', 'progress', 'start', 'end', 'tasks', 'overdue', 'area', 'status', 'lastActivity']) },
  { id: 'board', name: 'Board', layout: 'board', group: 'health', filter: active, hidden: showOnly(['name', 'dates', 'health', 'tasks', 'overdue', 'progress']) },
  { id: 'timeline', name: 'Timeline', layout: 'timeline', group: 'none', filter: active },
  { id: 'risk', name: 'At risk', layout: 'cards', group: 'area', filter: (r) => active(r) && r.health === 'At risk', hidden: showOnly(['name', 'dates', 'description', 'health', 'tasks', 'overdue', 'area', 'progress']) },
];

export function AllProjectsScreen() {
  return (
    <Suspense fallback={null}>
      <ProjectsPage />
    </Suspense>
  );
}

function ProjectsPage() {
  const router = useRouter();
  const openView = useSearchParams().get('view');
  const { rows, setDates, loading } = useProjectsDb();
  const columns = useMemo(() => projectColumns(), []);
  const groups = useMemo(() => projectGroups(), []);
  const open = (r: ProjectRow) => router.push(`/projects/${r.id}`);

  const activeRows = rows.filter(active);
  const atRisk = activeRows.filter((r) => r.health === 'At risk').length;
  const overdueTasks = activeRows.reduce((s, r) => s + r.overdue, 0);
  const sentence = atRiskSentence(rows);

  return (
    <NotionPage
      title="Projects"
      icon={<FolderKanban strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Projects', href: '/projects/all' }]}
      properties={[
        { id: 'active', label: 'Active', display: String(activeRows.length) },
        { id: 'risk', label: 'At risk', display: atRisk ? <Link href="/projects/all?view=risk">{atRisk}</Link> : '0' },
        { id: 'overdue', label: 'Overdue tasks', display: overdueTasks ? <Link href="/projects/focus?view=overdue">{overdueTasks}</Link> : '0' },
      ]}
    >
      <ScreenState loading={loading} />
      {sentence && (
        <Callout tone="watch" icon={<AlertTriangle size={18} strokeWidth={2} />}>
          <p>
            {sentence} <Link href="/projects/all?view=risk">Show at risk</Link>
          </p>
        </Callout>
      )}
      <Database<ProjectRow>
        key={openView ?? 'default'}
        id="time.projects"
        label="Projects"
        noun={['project', 'projects']}
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        views={VIEWS}
        openView={openView}
        groups={groups}
        defaultGroup="area"
        card={projectCardSpec(open)}
        list={projectListSpec}
        board={{ group: 'health', dot: (key) => (key in HEALTH_COLOR ? TAG_ACCENT[HEALTH_COLOR[key as ProjectRow['health']]] : null) }}
        extraLayouts={['timeline']}
        phoneLayouts={[]}
        renderLayout={(_, shown) => (
          <ProjectTimeline
            rows={shown.map((r) => ({ id: r.id, name: r.name, start: r.start, end: r.end, accent: healthAccent(r.health), fill: FILL[HEALTH_COLOR[r.health]] ?? '#e3e2e0', label: `${r.name} · ${Math.round(r.progress * 100)}%` }))}
            onOpen={(id) => router.push(`/projects/${id}`)}
            onChange={(id, start, end) => {
              const row = rows.find((r) => r.id === id);
              return row ? setDates(row, start, end) : undefined;
            }}
          />
        )}
        onOpen={open}
        onNew={() => router.push('/projects/new')}
        newLabel="New"
        emptyText="No projects yet."
      />
    </NotionPage>
  );
}
