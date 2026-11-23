'use client';

// An area page and a folder page on tablet and web (Dreda v1.0 `Area
// detail` 63068, `Folder detail` 63631): one component, two scopes.
//   Title and description; New folder (area) or New project (folder).
//   Four stat cards. A view bar: Overview, Folders (area), Projects, Tasks.
//   Overview: the area's folder cards, or the folder's projects table, then
//   its tasks (the first five, Show all). About on the right: description,
//   colour, weekly budget (areas), created.

import { useState } from 'react';
import Link from 'next/link';
import { Folder, Layers, LayoutGrid, Sun, AlertCircle, Check } from 'lucide-react';
import { useLogic, type Scope } from '@/src/logic/workScope/useLogic';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { plural, type FolderStat, type ProjectStat } from '@/src/viewmodels/organise';
import { durationText } from '@/src/viewmodels/todayPlan';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { StatCards, type Stat } from '@/src/widgets/Dashboard/StatCard';
import { TaskTable } from '@/src/widgets/TaskDb/TaskTable';
import { HealthTag } from '@/src/widgets/ProjectDb/projectDatabase';
import { Avatar } from '@/src/widgets/People/People';
import { usePeople } from '@/src/logic/people/store';
import { firstName, peopleOn } from '@/src/viewmodels/people';
import { AboutCard, CardGrid, ContainerCard, HeaderActions, HueBar, HueTile, longDate, SectionHead, ViewTabs } from '@/src/screens/Organise/parts';
import styles from '@/src/screens/Organise/Organise.module.css';
import own from './WorkScopeScreen.module.css';

type View = 'overview' | 'folders' | 'projects' | 'tasks';
const SHOWN = 5;
const dueDay = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null);

export function WorkScopeScreen(props: Scope) {
  const formLink = useFormLink();
  const v = useLogic(props);
  const [view, setView] = useState<View>('overview');
  const [archiving, setArchiving] = useState(false);
  const isArea = props.kind === 'area';
  const scope = isArea ? v.area : v.folder;

  if (v.loading) return <ScreenState loading />;
  if (!scope || !v.area) return <ScreenState error={`This ${isArea ? 'area' : 'folder'} no longer exists.`} />;

  const area = v.area;
  const name = scope.name;
  const folders = area.folders;
  const atRisk = v.projects.filter((p) => p.health === 'At risk');
  const budget = isArea ? area.weeklyHours : null;
  const created = (isArea ? v.areaDoc?.createdAt : v.folderDoc?.createdAt)?.toDate() ?? null;
  const crumbs = isArea
    ? [{ label: 'Areas', href: '/areas' }, { label: name }]
    : [{ label: area.name, href: `/areas/${area.id}` }, { label: name }];
  const sub = [scope.description, budget ? `Keep it to ${budget} hours a week.` : null].filter(Boolean).join(' ');

  const time: Stat = {
    label: 'Time this week',
    icon: <Sun size={18} />,
    value: durationText(scope.weekMinutes),
    chip: budget ? { text: `${durationText(Math.max(0, budget * 60 - scope.weekMinutes))} left`, hue: 'green' } : null,
    caption: budget ? `of ${budget} h budget` : 'booked on the calendar',
    href: '/projects/calendar',
  };
  const stats: Stat[] = isArea
    ? [
        { label: 'Folders', icon: <Folder size={18} />, value: String(folders.length), caption: folders.map((f) => f.name).join(', ') || 'none yet' },
        { label: 'Projects', icon: <Layers size={18} />, value: String(v.projects.length), chip: atRisk[0] ? { text: atRisk[0].name, hue: 'amber' } : null, caption: atRisk.length ? `${atRisk.length} at risk` : 'none at risk' },
        { label: 'Open tasks', icon: <Check size={18} />, value: String(scope.open), caption: `${scope.dueWeek} due this week` },
        time,
      ]
    : [
        { label: 'Projects', icon: <Layers size={18} />, value: String(v.projects.length), chip: atRisk[0] ? { text: atRisk[0].name, hue: 'amber' } : null, caption: atRisk.length ? `${atRisk.length} at risk` : 'none at risk' },
        { label: 'Open tasks', icon: <Check size={18} />, value: String(scope.open), caption: `${scope.dueWeek} due this week` },
        { label: 'Overdue', icon: <AlertCircle size={18} />, value: String(scope.overdue), chip: scope.overdue ? null : { text: 'On track', hue: 'green' }, caption: scope.overdue ? 'need a new date' : 'nothing late' },
        time,
      ];

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} aria-hidden /> },
    ...(isArea ? [{ id: 'folders' as const, label: 'Folders', icon: <Folder size={16} aria-hidden /> }] : []),
    { id: 'projects', label: 'Projects', icon: <Layers size={16} aria-hidden /> },
    { id: 'tasks', label: 'Tasks', icon: <Check size={16} aria-hidden /> },
  ];

  const taskBlock = (all: boolean) => (
    <>
      <SectionHead title={`Tasks in ${name}`} meta={all || v.tasks.length <= SHOWN ? plural(v.tasks.length, 'task') : `Showing ${SHOWN} of ${v.tasks.length}`} />
      {v.tasks.length === 0 ? (
        <p className={styles.empty}>Nothing open here.</p>
      ) : (
        <>
          <TaskTable groups={[{ id: 'tasks', label: 'Tasks', tone: null, tasks: all ? v.tasks : v.tasks.slice(0, SHOWN) }]} grouped={false} columns={['project', 'type', 'due', 'status']} onDone={v.setDone} />
          {!all && v.tasks.length > SHOWN && (
            <button type="button" className={own.showAll} onClick={() => setView('tasks')}>
              Show all {v.tasks.length}
            </button>
          )}
        </>
      )}
    </>
  );

  return (
    <NotionPage title={name} sub={sub || undefined} crumbs={crumbs} menu={[
        isArea ? { label: 'Edit area', href: formLink('area', { id: area.id }) } : { label: 'Edit folder', href: formLink('section', { id: scope.id }) },
        { label: 'Import tasks', href: formLink('import', { area: area.id }) },
        { label: isArea ? 'Archive area' : 'Archive folder', onSelect: () => setArchiving(true) },
      ]}>
      {isArea ? (
        <HeaderActions secondary={{ label: 'New project', href: formLink('project', { areaId: area.id }) }} primary={{ label: 'New folder', href: formLink('section', { areaId: area.id }) }} />
      ) : (
        <HeaderActions primary={{ label: 'New project', href: formLink('project', { areaId: area.id, bucketId: scope.id }) }} />
      )}
      <StatCards stats={stats} />
      <div className={styles.viewBar}>
        <ViewTabs<View> tabs={tabs} value={view} onChange={setView} />
      </div>
      <div className={styles.split}>
        <div className={styles.main}>
          {view === 'overview' && (
            <>
              {isArea ? <FolderCards folders={folders} /> : <ProjectsTable title={`Projects in ${name}`} projects={v.projects} />}
              {taskBlock(false)}
            </>
          )}
          {view === 'folders' && <FolderCards folders={folders} />}
          {view === 'projects' && <ProjectsTable title={`Projects in ${name}`} projects={v.projects} />}
          {view === 'tasks' && taskBlock(true)}
        </div>
        <div className={styles.side}>
          <AboutCard
            text={scope.description}
            editHref={isArea ? formLink('area', { id: area.id }) : formLink('section', { id: scope.id })}
            rows={created ? [['Created', longDate(created)]] : []}
          />
        </div>
      </div>
      {archiving && (
        <ConfirmDialog
          tone="neutral"
          title={`Archive ${name}?`}
          message={`It moves to the Archive in Library, ${isArea ? 'with its folders and projects left as they are' : 'and its projects stay as they are'}. Restore it from there any time.`}
          confirmLabel="Archive"
          cancelLabel="Cancel"
          onCancel={() => setArchiving(false)}
          onConfirm={() => void v.archive()}
        />
      )}
    </NotionPage>
  );
}

function FolderCards({ folders }: { folders: FolderStat[] }) {
  if (!folders.length) return <p className={styles.empty}>No folders yet.</p>;
  return (
    <CardGrid>
      {folders.map((f) => (
        <ContainerCard
          key={f.id}
          href={`/sections/${f.id}`}
          hue={f.hue}
          icon={<Folder size={20} />}
          name={f.name}
          description={f.description}
          meta={[plural(f.projects.length, 'project'), `${f.open} open ${f.open === 1 ? 'task' : 'tasks'}`, f.overdue ? `${f.overdue} overdue` : null].filter(Boolean).join(' · ')}
          progress={f.progress}
        />
      ))}
    </CardGrid>
  );
}

function ProjectsTable({ title, projects }: { title: string; projects: ProjectStat[] }) {
  const people = usePeople();
  return (
    <>
      <SectionHead title={title} meta={plural(projects.length, 'project')} />
      {projects.length === 0 ? (
        <p className={styles.empty}>No projects here yet.</p>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Due</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={styles.nameCell}>
                      <HueTile hue={p.hue}>{p.letter}</HueTile>
                      <span>
                        <Link href={`/projects/${p.id}`} className={styles.name}>
                          {p.name}
                        </Link>
                        {p.description && <span className={styles.desc}>{p.description}</span>}
                      </span>
                    </span>
                  </td>
                  <td>
                    <HealthTag health={p.health} />
                  </td>
                  <td>
                    <span className={styles.progressCell}>
                      <HueBar hue={p.hue} value={p.progress} />
                      <span className={styles.pct}>
                        {p.done}/{p.total}
                      </span>
                    </span>
                  </td>
                  <td className={styles.muted}>{dueDay(p.end)}</td>
                  <td>
                    {(() => {
                      const owner = peopleOn(people, p.name)[0];
                      return owner ? (
                        <span className={own.owner}>
                          <Avatar id={owner.avatarId} size={26} alt="" />
                          {firstName(owner.name)}
                        </span>
                      ) : null;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
