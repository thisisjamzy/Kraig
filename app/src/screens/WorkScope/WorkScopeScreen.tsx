'use client';

// An area page and a folder page on tablet and web (Dreda.figcraft `Area /
// Web`, `Folder / Web`): one component, two scopes. Four tiles (open tasks,
// due this week, waiting on someone, time blocked this week), the folders in
// the area, a table of its projects, then the tasks next up with Show all.

import { useState } from 'react';
import Link from 'next/link';
import { Folder, Map as MapIcon } from 'lucide-react';
import { useLogic } from '@/src/logic/workScope/useLogic';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TopBarActions } from '@/src/widgets/AppShell/TopBarSlot';
import styles from './WorkScopeScreen.module.css';

const NEXT_UP = 5;
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const hours = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);
const QUADRANT: Record<string, string> = { do: 'Do first', schedule: 'Schedule', delegate: 'Delegate', eliminate: 'Drop' };

export function WorkScopeScreen(props: { kind: 'area'; areaId: string } | { kind: 'folder'; folderId: string }) {
  const formLink = useFormLink();
  const taskPanel = useTaskPanel();
  const { area, folder, summary, loading } = useLogic(props);
  const [allTasks, setAllTasks] = useState(false);

  const isArea = props.kind === 'area';
  const name = isArea ? area?.name : folder?.name;
  if (loading || !summary || !area || (!isArea && !folder)) {
    return <ScreenState loading={loading} error={loading ? null : `This ${isArea ? 'area' : 'folder'} no longer exists.`} />;
  }

  const c = summary.counts;
  const shown = allTasks ? summary.tasks : summary.tasks.slice(0, NEXT_UP);
  const crumbs = [
    { label: 'Time', href: '/projects' },
    { label: 'Work', href: '/work' },
    ...(isArea ? [] : [{ label: area.name, href: `/areas/${area.id}` }]),
    { label: name ?? '' },
  ];

  return (
    <NotionPage
      title={name ?? ''}
      icon={isArea ? <MapIcon strokeWidth={1.75} /> : <Folder strokeWidth={1.75} />}
      crumbs={crumbs}
      menu={isArea ? [{ label: 'Edit area', href: formLink('area', { id: area.id }) }] : [{ label: 'Edit folder', href: formLink('section', { id: folder!.id }) }]}
      sub={
        <>
          {isArea ? 'Area' : `Folder in ${area.name}`} · {isArea ? `${plural(c.folders, 'folder')}, ` : ''}
          {plural(c.projects, 'project')}, {plural(c.tasks, 'task')} · {c.donePct}% done
        </>
      }
    >
      <TopBarActions>
        {isArea && (
          <Link href={formLink('section', { areaId: area.id })} className={styles.secondary}>
            New folder
          </Link>
        )}
        <Link href={formLink('project', { areaId: area.id })} className={styles.secondary}>
          New project
        </Link>
      </TopBarActions>
      <div className={styles.tiles}>
        <Tile value={String(summary.tiles.openTasks)} label="Open tasks" />
        <Tile value={String(summary.tiles.dueThisWeek)} label="Due this week" />
        <Tile value={String(summary.tiles.waiting)} label="Waiting on someone" />
        <Tile value={hours(summary.tiles.blockedMinutes)} label="Blocked out this week" />
      </div>

      {isArea && (
        <section className={styles.block}>
          <header className={styles.blockHead}>
            <h2 className={styles.overline}>Folders in this area</h2>
            <Link href={formLink('section', { areaId: area.id })} className={styles.textLink}>
              New folder
            </Link>
          </header>
          {summary.folders.length ? (
            <div className={styles.folders}>
              {summary.folders.map((f) => (
                <article key={f.id} className={styles.folder}>
                  <h3 className={styles.folderName}>
                    <span className={styles.dot} style={{ background: f.color }} aria-hidden />
                    {f.name}
                  </h3>
                  <p className={styles.meta}>
                    {plural(f.projects.length, 'project')} · {plural(f.total, 'task')} · {f.openTasks} open{f.nextDue ? ` · next due ${day(f.nextDue)}` : ''}
                  </p>
                  <span className={styles.track} aria-hidden>
                    <span style={{ width: `${f.total ? (f.done / f.total) * 100 : 0}%`, background: f.color }} />
                  </span>
                  {f.projects.length > 0 && (
                    <span className={styles.chips}>
                      {f.projects.map((p) => (
                        <Link key={p.id} href={`/projects/${p.id}`} className={styles.chip}>
                          {p.name} · {p.openTasks}
                        </Link>
                      ))}
                    </span>
                  )}
                  <Link href={`/sections/${f.id}`} className={styles.textLink}>
                    Open folder
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No folders yet.</p>
          )}
        </section>
      )}

      <section className={styles.block}>
        <header className={styles.blockHead}>
          <h2 className={styles.overline}>Projects in this {isArea ? 'area' : 'folder'}</h2>
          <Link href={formLink('project', { areaId: area.id })} className={styles.textLink}>
            New project
          </Link>
        </header>
        {summary.projects.length ? (
          <div className={styles.table} role="table" aria-label="Projects">
            <div className={styles.tr} role="row" data-head>
              <span role="columnheader">Project</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Due</span>
              <span role="columnheader">Waiting</span>
              <span role="columnheader">Tasks</span>
              <span role="columnheader" aria-label="Open" />
            </div>
            {summary.projects.map((p) => (
              <div key={p.id} className={styles.tr} role="row">
                <span role="cell" className={styles.projectCell}>
                  <span className={styles.dot} style={{ background: p.color }} aria-hidden />
                  <span>
                    {p.name}
                    {p.folderName && isArea && <small>{p.folderName}</small>}
                  </span>
                </span>
                <span role="cell">
                  <span className={styles.pill}>{p.status === 'Completed' ? 'Done' : p.openTasks ? 'In progress' : 'Planned'}</span>
                </span>
                <span role="cell" className={styles.progressCell}>
                  <small>
                    {p.done} of {p.tasks}
                  </small>
                  <span className={styles.track} aria-hidden>
                    <span style={{ width: `${Math.round(p.progress * 100)}%`, background: p.color }} />
                  </span>
                </span>
                <span role="cell" className={styles.meta}>
                  {p.due ? day(p.due) : '–'}
                </span>
                <span role="cell" className={styles.meta}>
                  {p.waiting ? `${p.waiting} waiting` : '–'}
                </span>
                <span role="cell" className={styles.meta}>
                  {p.openTasks}
                </span>
                <span role="cell">
                  <Link href={`/projects/${p.id}`} className={styles.textLink}>
                    Open
                  </Link>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No projects here yet.</p>
        )}
      </section>

      <section className={styles.block}>
        <header className={styles.blockHead}>
          <h2 className={styles.overline}>Tasks in this {isArea ? 'area' : 'folder'} · next up</h2>
          <Link href={taskPanel.hrefFor('new')} scroll={false} className={styles.textLink}>
            New task
          </Link>
        </header>
        {summary.tasks.length ? (
          <div className={styles.taskList}>
            {shown.map((t) => (
              <button key={t.id} type="button" className={styles.task} onClick={() => taskPanel.open(t.id)}>
                <span className={styles.check} aria-hidden />
                <span className={styles.taskCopy}>
                  <span className={styles.taskTitle}>{t.title}</span>
                  <span className={styles.meta}>{[t.where, t.minutes ? hours(t.minutes) : null, t.when ? day(t.when) : null, t.waiting ? 'waiting on someone' : null].filter(Boolean).join(' · ')}</span>
                </span>
                {t.quadrant === 'do' && <span className={styles.flag}>{QUADRANT.do}</span>}
              </button>
            ))}
            {summary.tasks.length > NEXT_UP && (
              <button type="button" className={styles.showAll} onClick={() => setAllTasks(!allTasks)}>
                {allTasks ? 'Show the next few' : `Show all ${summary.tasks.length} tasks in this ${isArea ? 'area' : 'folder'}`}
              </button>
            )}
          </div>
        ) : (
          <p className={styles.empty}>Nothing open here.</p>
        )}
      </section>

      {!isArea && (
        <section className={styles.block}>
          <h2 className={styles.overline}>Resources</h2>
          <p className={styles.empty}>
            Notes, files and links for this folder will show here once Resources is ready. See <Link href="/library">Library</Link>.
          </p>
        </section>
      )}
    </NotionPage>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.meta}>{label}</span>
    </div>
  );
}
