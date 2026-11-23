'use client';

// Projects (Dreda v1.0 `Projects` 57627, `Projects board` 58404, `Projects
// timeline` 59140).
//   Title "Projects"; under it "3 areas, 5 folders, 11 projects, 4 at risk".
//   Top bar: New folder, then New project.
//   Four stat cards: active projects, overdue tasks, due this week, time
//   blocked this week.
//   One view bar over the Projects database: All projects (cards grouped by
//   folder), Board (by stage: Planned, In progress, At risk, Done),
//   Timeline (bars grouped by area and folder, drag the ends to change
//   dates) and Table; Filter, Sort, Search and View settings on the right.

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarDays, Layers, Sun } from 'lucide-react';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { usePeople } from '@/src/logic/people/store';
import { peopleOn } from '@/src/viewmodels/people';
import { crumbOf, plural } from '@/src/viewmodels/organise';
import { hueVars } from '@/src/viewmodels/projects';
import { durationText } from '@/src/viewmodels/todayPlan';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import type { DefaultView } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { StatCards } from '@/src/widgets/Dashboard/StatCard';
import { ProjectTimeline } from '@/src/widgets/ProjectTimeline/ProjectTimeline';
import { projectCardSpec, projectColumns, projectGroups, projectListSpec, STAGE_HUE, type ProjectCardRow } from '@/src/widgets/ProjectDb/projectDatabase';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { HeaderActions } from '@/src/screens/Organise/parts';

const ALL = ['name', 'health', 'stage', 'priority', 'progress', 'dates', 'start', 'end', 'tasks', 'overdue', 'blocked', 'area', 'folder', 'status', 'description', 'next', 'people', 'block', 'lastActivity'];
const showOnly = (ids: string[]) => ALL.filter((id) => !ids.includes(id));
const active = (r: ProjectCardRow) => r.status === 'Active';

export const PROJECT_VIEWS: DefaultView<ProjectCardRow>[] = [
  { id: 'gallery', name: 'All projects', layout: 'cards', group: 'folder', filter: active, hidden: showOnly(['name', 'health', 'priority', 'end', 'description', 'progress', 'tasks', 'next', 'people', 'block']) },
  { id: 'board', name: 'Board', layout: 'board', group: 'stage', filter: (r) => r.status !== 'Archived', hidden: showOnly(['name', 'description', 'progress', 'end', 'people']) },
  { id: 'timeline', name: 'Timeline', layout: 'timeline', group: 'none', filter: active },
  { id: 'table', name: 'Table', layout: 'table', group: 'none', hidden: showOnly(['name', 'stage', 'health', 'progress', 'end', 'tasks', 'overdue', 'blocked', 'area', 'folder']) },
];

export function AllProjectsScreen() {
  return (
    <Suspense fallback={null}>
      <ProjectsPage />
    </Suspense>
  );
}

function ProjectsPage() {
  const openView = useSearchParams().get('view');
  const formLink = useFormLink();
  const o = useOrganise();
  const live = o.projects.filter((p) => p.status === 'Active');
  const atRisk = live.filter((p) => p.health === 'At risk').length;
  const overdue = live.reduce((s, p) => s + p.overdue, 0);
  const overdueIn = live.filter((p) => p.overdue > 0).length;
  const dueWeek = live.reduce((s, p) => s + p.dueWeek, 0);
  const dueToday = live.reduce((s, p) => s + p.dueToday, 0);
  const dueIn = live.filter((p) => p.dueWeek > 0).length;
  const blocked = live.reduce((s, p) => s + p.weekMinutes, 0);
  const folders = o.folders.length;
  const sub = `${plural(o.areas.length, 'area')}, ${plural(folders, 'folder')}, ${plural(live.length, 'project')}${atRisk ? `, ${atRisk} at risk` : ''}`;

  return (
    <NotionPage title="Projects" sub={sub} crumbs={[{ label: 'Projects', href: '/projects/all' }]}>
      <HeaderActions secondary={{ label: 'New folder', href: formLink('section') }} primary={{ label: 'New project', href: formLink('project') }} />
      <ScreenState loading={o.loading} />
      <StatCards
        stats={[
          { label: 'Active projects', icon: <Layers size={18} />, value: String(live.length), chip: atRisk ? { text: `${atRisk} at risk`, hue: 'orange' } : null, caption: atRisk ? 'needs a look' : 'all on course', href: '/projects/all?view=board' },
          { label: 'Overdue tasks', icon: <AlertCircle size={18} />, value: String(overdue), chip: overdue ? { text: `${overdue}`, hue: 'rose' } : null, caption: overdue ? `in ${plural(overdueIn, 'project')}` : 'nothing late', href: '/tasks' },
          { label: 'Due this week', icon: <CalendarDays size={18} />, value: String(dueWeek), chip: { text: `${dueToday} today`, hue: 'grey' }, caption: `across ${plural(dueIn, 'project')}`, href: '/tasks?view=upcoming' },
          { label: 'Time blocked', icon: <Sun size={18} />, value: durationText(blocked), caption: 'this week', href: '/projects/calendar' },
        ]}
      />
      <ProjectsDatabase openView={openView} />
    </NotionPage>
  );
}

/** The Projects database (All projects, Board, Timeline, Table). Work's
 * views render it with the view fixed. */
export function ProjectsDatabase({ openView, views = PROJECT_VIEWS, filterRows }: { openView: string | null; views?: DefaultView<ProjectCardRow>[]; filterRows?: (r: ProjectCardRow) => boolean }) {
  const formLink = useFormLink();
  const router = useRouter();
  const o = useOrganise();
  const people = usePeople();
  const rows = useMemo(() => {
    const stats = new Map(o.projects.map((p) => [p.id, p]));
    const all = o.rows.filter((r) => stats.has(r.id)).map((r) => ({ ...r, ...stats.get(r.id)! }));
    return filterRows ? all.filter(filterRows) : all;
  }, [o.rows, o.projects, filterRows]);
  const columns = useMemo(() => projectColumns(), []);
  const groups = useMemo(() => projectGroups(), []);
  const open = (r: ProjectCardRow) => router.push(`/projects/${r.id}`);
  return (
    <Database<ProjectCardRow>
      key={openView ?? 'default'}
      viewTabs
      id="time.projects.v1"
      label="Projects"
      noun={['project', 'projects']}
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      views={views}
      openView={openView}
      groups={groups}
      defaultGroup="folder"
      card={projectCardSpec(open, (r) => peopleOn(people, r.name))}
      list={projectListSpec}
      board={{ group: 'stage', fill: true, dot: (key) => (key in STAGE_HUE ? hueVars(STAGE_HUE[key as ProjectCardRow['stage']]).solid : null) }}
      extraLayouts={['timeline']}
      phoneLayouts={[]}
      renderLayout={(_, shown) => (
        <ProjectTimeline
          rows={[...shown]
            .sort((a, b) => crumbOf(a).localeCompare(crumbOf(b)))
            .map((r) => {
              const v = hueVars(r.hue);
              return {
                id: r.id,
                name: r.name,
                start: r.start,
                end: r.end,
                accent: v.border,
                fill: v.bg,
                ink: v.fg,
                dot: v.solid,
                progress: r.progress,
                group: crumbOf(r) || 'No area',
                late: r.overdue ? `${r.overdue} overdue` : null,
                label: `${r.name} · ${r.stage === 'Done' ? 'Done' : `${r.done}/${r.total}`}`,
              };
            })}
          onOpen={(id) => router.push(`/projects/${id}`)}
          onChange={(id, start, end) => {
            const row = rows.find((r) => r.id === id);
            return row ? o.setDates(row, start, end) : undefined;
          }}
        />
      )}
      onOpen={open}
      onNew={() => router.push(formLink('project'))}
      newTemplates={[{ id: 'import', label: 'Import tasks', onSelect: () => router.push(formLink('import')) }]}
      newLabel="New"
      emptyText="No projects yet."
    />
  );
}
