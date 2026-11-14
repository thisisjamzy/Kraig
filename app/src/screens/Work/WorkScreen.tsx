'use client';

// Work (Dreda.figcraft `Work / Web`): Areas and Projects as one page. Tree
// is one card per area (swatch, name, counts, progress, next due, Open area)
// with a row per folder (its projects as chips, its task count, Open
// folder). Table and Timeline are the Projects database's own views. Filters:
// Everything, Active, Due this week, Waiting, Archived.

import Link from 'next/link';
import { TopBarControls, TopBarPrimary } from '@/src/widgets/AppShell/TopBarSlot';
import { NewMenuButton } from '@/src/widgets/AppShell/NewMenuButton';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { Archive, CalendarClock, CheckSquare, ChevronRight, CircleDot, FolderKanban, Hourglass, Layers, Map as MapIcon, Table2 } from 'lucide-react';
import { useLogic, type WorkView } from '@/src/logic/work/useLogic';
import { ProjectsDatabase, PROJECT_VIEWS } from '@/src/screens/AllProjects/AllProjectsScreen';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import type { WorkFilter } from '@/src/viewmodels/work';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './WorkScreen.module.css';

const VIEWS: { key: WorkView; label: string }[] = [
  { key: 'tree', label: 'Tree' },
  { key: 'table', label: 'Table' },
  { key: 'timeline', label: 'Timeline' },
];

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function WorkScreen() {
  const formLink = useFormLink();
  const taskPanel = useTaskPanel();
  const w = useLogic();
  const { tree } = w;
  const t = tree.totals;

  return (
    <NotionPage
      title="Work"
      icon={<Layers strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Work', href: '/work' }]}
      sub={`${plural(t.areas, 'area')}, ${plural(t.folders, 'folder')}, ${plural(t.projects, 'project')}, ${plural(t.tasks, 'task')}. Open an area to see everything inside it.`}
    >
      <TopBarControls>
        <span className={styles.segmented} role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="radio" aria-checked={w.view === v.key} onClick={() => w.setView(v.key)}>
              {v.label}
            </button>
          ))}
        </span>
      </TopBarControls>
      {/* One New button with a menu, in place of New task, New project and New area. */}
      <TopBarPrimary>
        <NewMenuButton
          items={[
            { label: 'New task', href: taskPanel.hrefFor('new'), icon: <CheckSquare size={16} strokeWidth={2} aria-hidden /> },
            { label: 'New project', href: formLink('project'), icon: <FolderKanban size={16} strokeWidth={2} aria-hidden /> },
            { label: 'New area', href: formLink('area'), icon: <MapIcon size={16} strokeWidth={2} aria-hidden /> },
          ]}
        />
      </TopBarPrimary>
      <ScreenState loading={w.loading} />

      {w.view === 'tree' ? (
        <>
          <TypeTabs<WorkFilter>
            label="Show"
            value={w.filter}
            onChange={w.setFilter}
            tabs={[
              { key: 'everything', label: 'Everything', icon: Table2, count: tree.counts.everything },
              { key: 'active', label: 'Active', icon: CircleDot, count: tree.counts.active },
              { key: 'week', label: 'Due this week', icon: CalendarClock, count: tree.counts.week },
              { key: 'waiting', label: 'Waiting', icon: Hourglass, count: tree.counts.waiting },
              { key: 'archived', label: 'Archived', icon: Archive, count: tree.counts.archived },
            ]}
          />
          {!w.loading && !tree.areas.length && <p className={styles.empty}>{w.filter === 'everything' ? 'No areas yet. Start with New area.' : 'Nothing matches this filter.'}</p>}
          <div className={styles.areas}>
            {tree.areas.map((area) => {
              const pct = area.tasks ? Math.round((area.done / area.tasks) * 100) : 0;
              return (
                <section key={area.id} className={styles.area} aria-label={area.name}>
                  <header className={styles.areaHead}>
                    <span className={styles.swatch} style={{ background: area.color }} aria-hidden>
                      {area.initials}
                    </span>
                    <span className={styles.areaTitles}>
                      <Link href={`/areas/${area.id}`} className={styles.areaName}>
                        {area.name}
                      </Link>
                      <span className={styles.meta}>
                        Area · {plural(area.folders.length, 'folder')} · {plural(area.projects, 'project')} · {plural(area.tasks, 'task')}
                      </span>
                    </span>
                    <span className={styles.progress}>
                      <span className={styles.meta}>
                        {pct}% done · {area.done} of {area.tasks}
                      </span>
                      <span className={styles.track}>
                        <span style={{ width: `${pct}%`, background: area.color }} />
                      </span>
                    </span>
                    <span className={styles.nextDue}>
                      <span className={styles.metaStrong}>Next due</span>
                      <span className={styles.meta}>{area.nextDue ? day(area.nextDue) : 'Nothing dated'}</span>
                    </span>
                    <Link href={`/areas/${area.id}`} className={styles.secondary}>
                      Open area
                    </Link>
                  </header>
                  {area.folders.map((folder) => (
                    <div key={folder.id} className={styles.folder}>
                      <span className={styles.folderName}>
                        <span className={styles.dot} style={{ background: folder.color }} aria-hidden />
                        {folder.name}
                      </span>
                      <span className={styles.chips}>
                        {folder.projects.map((p) => (
                          <Link key={p.id} href={`/projects/${p.id}`} className={styles.chip}>
                            {p.name}
                          </Link>
                        ))}
                        {!folder.projects.length && <span className={styles.meta}>No projects</span>}
                      </span>
                      <span className={styles.meta}>{plural(folder.openTasks, 'task')}</span>
                      <Link href={`/sections/${folder.id}`} className={styles.openFolder}>
                        Open folder <ChevronRight size={14} strokeWidth={2} aria-hidden />
                      </Link>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <ProjectsDatabase key={w.view} openView={w.view} views={PROJECT_VIEWS.filter((v) => v.id === w.view)} />
      )}
    </NotionPage>
  );
}
