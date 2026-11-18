'use client';

// Areas (Dreda v1.0 `Areas / Web` 62644).
//   Title "Areas"; under it "3 areas, 5 folders, 11 projects. Click an area
//   to open it." New area in the top bar.
//   Four stat cards: areas (the busiest), folders, open tasks, overdue.
//   Table: each area with its folders nested under it (folders, projects,
//   open tasks, overdue, booked this week, progress); Cards: one card per
//   area with its folders listed.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Folder, LayoutGrid, Table2 } from 'lucide-react';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { plural } from '@/src/viewmodels/organise';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { StatCards } from '@/src/widgets/Dashboard/StatCard';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { CardGrid, ContainerCard, HeaderActions, HueBar, HueTile, ViewTabs, weekText } from '@/src/screens/Organise/parts';
import styles from '@/src/screens/Organise/Organise.module.css';

type View = 'table' | 'cards';

export function AllAreasScreen() {
  const formLink = useFormLink();
  const router = useRouter();
  const o = useOrganise();
  const [view, setView] = useState<View>('table');
  const folders = o.folders;
  const projects = o.projects.filter((p) => p.status === 'Active');
  const open = o.areas.reduce((s, a) => s + a.open, 0);
  const week = o.areas.reduce((s, a) => s + a.dueWeek, 0);
  const overdue = o.areas.reduce((s, a) => s + a.overdue, 0);
  const lateAreas = o.areas.filter((a) => a.overdue > 0).map((a) => a.name);
  const busiest = [...o.areas].sort((a, b) => b.open - a.open)[0];

  return (
    <NotionPage
      title="Areas"
      sub={`${plural(o.areas.length, 'area')}, ${plural(folders.length, 'folder')}, ${plural(projects.length, 'project')}. Click an area to open it.`}
      crumbs={[{ label: 'Areas', href: '/areas' }]}
    >
      <HeaderActions primary={{ label: 'New area', href: formLink('area') }} />
      <ScreenState loading={o.loading} />
      <StatCards
        stats={[
          {
            label: 'Areas',
            icon: <LayoutGrid size={18} />,
            value: String(o.areas.length),
            chip: busiest ? { text: `${busiest.name} busiest`, hue: 'grey' } : null,
            caption: 'all active',
          },
          {
            label: 'Folders',
            icon: <Folder size={18} />,
            value: String(folders.length),
            caption: `in ${plural(o.areas.length, 'area')}`,
            href: '/sections',
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
            caption: overdue ? `in ${lateAreas.join(' and ')}` : 'nothing late',
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
      {!o.loading && o.areas.length === 0 ? (
        <p className={styles.empty}>
          No areas yet. <Link href={formLink('area')}>Add the first one</Link>.
        </p>
      ) : view === 'table' ? (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Area</th>
                <th>Folders</th>
                <th>Projects</th>
                <th>Open tasks</th>
                <th>Overdue</th>
                <th>This week</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {o.areas.flatMap((a) => [
                <tr key={a.id} data-href onClick={() => router.push(`/areas/${a.id}`)}>
                  <td>
                    <span className={styles.nameCell}>
                      <HueTile hue={a.hue}>
                        <LayoutGrid size={18} />
                      </HueTile>
                      <span>
                        <Link href={`/areas/${a.id}`} className={styles.name} onClick={(e) => e.stopPropagation()}>
                          {a.name}
                        </Link>
                        {a.description && <span className={styles.desc}>{a.description}</span>}
                      </span>
                    </span>
                  </td>
                  <td>{a.folders.length}</td>
                  <td>{a.projects.length}</td>
                  <td>{a.open}</td>
                  <td className={a.overdue ? styles.late : undefined}>{a.overdue}</td>
                  <td>{weekText(a.weekMinutes)}</td>
                  <td>
                    <span className={styles.progressCell}>
                      <HueBar hue={a.hue} value={a.progress} />
                      <span className={styles.pct}>{Math.round(a.progress * 100)}%</span>
                    </span>
                  </td>
                </tr>,
                ...a.folders.map((f, i, list) => (
                  <tr key={f.id} data-href data-level="1" data-last={i === list.length - 1 || undefined} onClick={() => router.push(`/sections/${f.id}`)}>
                    <td>
                      <span className={styles.nameCell}>
                        <HueTile hue="grey" size={32}>
                          <Folder size={16} />
                        </HueTile>
                        <span>
                          <Link href={`/sections/${f.id}`} className={styles.name} onClick={(e) => e.stopPropagation()}>
                            {f.name}
                          </Link>
                          {f.description && <span className={styles.desc}>{f.description}</span>}
                        </span>
                      </span>
                    </td>
                    <td className={styles.muted}>–</td>
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
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      ) : (
        <CardGrid>
          {o.areas.map((a) => (
            <ContainerCard
              key={a.id}
              href={`/areas/${a.id}`}
              hue={a.hue}
              icon={<LayoutGrid size={20} />}
              name={a.name}
              description={a.description}
              meta={[plural(a.folders.length, 'folder'), plural(a.projects.length, 'project'), `${a.open} open`, a.overdue ? `${a.overdue} overdue` : null].filter(Boolean).join(' · ')}
              progress={a.progress}
            />
          ))}
        </CardGrid>
      )}
    </NotionPage>
  );
}
