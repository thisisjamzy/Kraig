'use client';

// Folders (Dreda v1.0 `Folders / Web` 64279).
//   Title "Folders"; under it "5 folders across 3 areas. Click a folder to
//   open its projects, tasks and notes." New folder in the top bar.
//   Four stat cards: folders, projects, open tasks, overdue.
//   Table: every folder grouped by area (groups fold away); a folder opens
//   to its projects in place, and its name opens the folder.
//   Cards: one card per folder with its projects.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, ChevronDown, ChevronRight, Folder, Layers, LayoutGrid, Table2 } from 'lucide-react';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { plural, type FolderStat } from '@/src/viewmodels/organise';
import { hueVars } from '@/src/viewmodels/projects';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { StatCards } from '@/src/widgets/Dashboard/StatCard';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { CardGrid, ContainerCard, HeaderActions, HueBar, HueTile, ViewTabs, weekText } from '@/src/screens/Organise/parts';
import styles from '@/src/screens/Organise/Organise.module.css';
import own from './FoldersScreen.module.css';

type View = 'table' | 'cards';

export function FoldersScreen() {
  const formLink = useFormLink();
  const router = useRouter();
  const o = useOrganise();
  const [view, setView] = useState<View>('table');
  const [closedAreas, setClosedAreas] = useState<Set<string>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const folders = o.folders;
  const projects = o.projects.filter((p) => p.status === 'Active');
  const open = o.areas.reduce((s, a) => s + a.open, 0);
  const week = o.areas.reduce((s, a) => s + a.dueWeek, 0);
  const overdue = o.areas.reduce((s, a) => s + a.overdue, 0);
  const atRisk = projects.filter((p) => p.health === 'At risk');
  const busiest = [...folders].sort((a, b) => b.open - a.open)[0];
  const areasWith = o.areas.filter((a) => a.folders.length > 0);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <NotionPage
      title="Folders"
      sub={`${plural(folders.length, 'folder')} across ${plural(areasWith.length, 'area')}. Click a folder to open its projects and tasks.`}
      crumbs={[{ label: 'Folders', href: '/sections' }]}
    >
      <HeaderActions primary={{ label: 'New folder', href: formLink('section') }} />
      <ScreenState loading={o.loading} />
      <StatCards
        stats={[
          {
            label: 'Folders',
            icon: <Folder size={18} />,
            value: String(folders.length),
            chip: busiest ? { text: `${busiest.name} busiest`, hue: 'grey' } : null,
            caption: `in ${plural(areasWith.length, 'area')}`,
            href: '/areas',
          },
          {
            label: 'Projects',
            icon: <Layers size={18} />,
            value: String(projects.length),
            chip: atRisk[0] ? { text: atRisk[0].name, hue: 'amber' } : null,
            caption: atRisk.length ? `${atRisk.length} at risk` : 'none at risk',
            href: '/projects/all',
          },
          {
            label: 'Open tasks',
            icon: <Check size={18} />,
            value: String(open),
            chip: { text: `${week} this week`, hue: 'grey' },
            caption: `across ${plural(projects.length, 'project')}`,
            href: '/tasks?view=all',
          },
          {
            label: 'Overdue',
            icon: <AlertCircle size={18} />,
            value: String(overdue),
            chip: overdue ? { text: `${overdue}`, hue: 'rose' } : null,
            caption: overdue
              ? `in ${o.areas
                  .filter((a) => a.overdue)
                  .map((a) => a.name)
                  .join(' and ')}`
              : 'nothing late',
            href: '/tasks',
          },
        ]}
      />
      <div className={styles.viewBar}>
        <ViewTabs<View>
          tabs={[
            {
              id: 'table',
              label: 'Table',
              icon: <Table2 size={16} aria-hidden />,
            },
            {
              id: 'cards',
              label: 'Cards',
              icon: <LayoutGrid size={16} aria-hidden />,
            },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {!o.loading && folders.length === 0 ? (
        <p className={styles.empty}>
          No folders yet. <Link href={formLink('section')}>Add the first one</Link>.
        </p>
      ) : view === 'table' ? (
        <div className={`${styles.tableCard} ${own.tree}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Folder</th>
                <th>Projects</th>
                <th>Open tasks</th>
                <th>Overdue</th>
                <th>This week</th>
                <th>Progress</th>
              </tr>
            </thead>
            {areasWith.map((a) => {
              const areaOpen = !closedAreas.has(a.id);
              const list = a.folders;
              return (
                <tbody key={a.id}>
                  <tr className={styles.groupRow}>
                    <th colSpan={6} scope="rowgroup">
                      <button type="button" className={styles.groupToggle} aria-expanded={areaOpen} onClick={() => setClosedAreas((s) => toggle(s, a.id))}>
                        <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
                        <span className={styles.dot} style={{ background: hueVars(a.hue).solid }} aria-hidden />
                        {a.name}
                        <span className={styles.groupCount}>{plural(list.length, 'folder')}</span>
                      </button>
                    </th>
                  </tr>
                  {areaOpen &&
                    list.flatMap((f, fi) => {
                      const expanded = openFolders.has(f.id) && f.projects.length > 0;
                      const lastFolder = fi === list.length - 1;
                      return [
                        <tr key={f.id} data-href data-level="1" data-last={(lastFolder && !expanded) || undefined} data-open={expanded || undefined} onClick={() => router.push(`/sections/${f.id}`)}>
                          <td>
                            <span className={styles.nameCell}>
                              {f.projects.length > 0 ? (
                                <button
                                  type="button"
                                  className={own.expand}
                                  aria-expanded={expanded}
                                  aria-label={expanded ? `Hide the projects in ${f.name}` : `Show the projects in ${f.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenFolders((s) => toggle(s, f.id));
                                  }}
                                >
                                  <ChevronRight size={16} strokeWidth={2.25} />
                                </button>
                              ) : (
                                <span className={own.expand} aria-hidden />
                              )}
                              <HueTile hue={f.hue}>
                                <Folder size={18} />
                              </HueTile>
                              <FolderName f={f} />
                            </span>
                          </td>
                          <td>{f.projects.length}</td>
                          <td>{f.open}</td>
                          <td className={f.overdue ? styles.late : undefined}>{f.overdue}</td>
                          <td>{weekText(f.weekMinutes)}</td>
                          <td>
                            <span className={styles.progressCell}>
                              <HueBar hue={f.hue} value={f.progress} />
                              <span className={styles.pct}>{Math.round(f.progress * 100)}%</span>
                            </span>
                          </td>
                        </tr>,
                        ...(expanded
                          ? f.projects.map((p, i) => (
                              <tr
                                key={p.id}
                                data-href
                                data-level="2"
                                data-last={i === f.projects.length - 1 || undefined}
                                data-parent-last={lastFolder || undefined}
                                onClick={() => router.push(`/projects/${p.id}`)}
                              >
                                <td>
                                  <span className={styles.nameCell}>
                                    <HueTile hue={p.hue} size={32}>
                                      {p.letter}
                                    </HueTile>
                                    <span>
                                      <Link href={`/projects/${p.id}`} className={styles.name} onClick={(e) => e.stopPropagation()}>
                                        {p.name}
                                      </Link>
                                      {p.description && <span className={styles.desc}>{p.description}</span>}
                                    </span>
                                  </span>
                                </td>
                                <td className={styles.muted}>–</td>
                                <td>{p.open}</td>
                                <td className={p.overdue ? styles.late : undefined}>{p.overdue}</td>
                                <td>{weekText(p.weekMinutes)}</td>
                                <td>
                                  <span className={styles.progressCell}>
                                    <HueBar hue={p.hue} value={p.progress} />
                                    <span className={styles.pct}>{Math.round(p.progress * 100)}%</span>
                                  </span>
                                </td>
                              </tr>
                            ))
                          : []),
                      ];
                    })}
                </tbody>
              );
            })}
          </table>
        </div>
      ) : (
        <CardGrid>
          {folders.map((f) => (
            <ContainerCard
              key={f.id}
              href={`/sections/${f.id}`}
              hue={f.hue}
              icon={<Folder size={20} />}
              name={f.name}
              description={f.description}
              meta={[f.areaName, plural(f.projects.length, 'project'), `${f.open} open`, f.overdue ? `${f.overdue} overdue` : null].filter(Boolean).join(' · ')}
              progress={f.progress}
            />
          ))}
        </CardGrid>
      )}
    </NotionPage>
  );
}

function FolderName({ f, plain }: { f: FolderStat; plain?: boolean }) {
  return (
    <span>
      {plain ? (
        <span className={styles.name}>{f.name}</span>
      ) : (
        <Link href={`/sections/${f.id}`} className={styles.name} onClick={(e) => e.stopPropagation()}>
          {f.name}
        </Link>
      )}
      {f.description && <span className={styles.desc}>{f.description}</span>}
    </span>
  );
}
