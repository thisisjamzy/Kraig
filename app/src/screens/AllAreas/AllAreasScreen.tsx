'use client';

// Areas: a Notion page, full width. Properties: Areas, Active projects,
// Open tasks, At risk projects. The areas database (Gallery and Table)
// with "New area". Gallery cards: the area's emoji or color tile, name,
// description (two lines) and "15 projects · 42 open tasks · 3 at risk".

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Map as MapIcon, MoreHorizontal } from 'lucide-react';
import { useLogic, type AreaRow } from '@/src/logic/allAreas/useLogic';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { areaFigures } from '@/src/viewmodels/home';
import styles from './AllAreasScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

const figures = areaFigures;

const COLUMNS: ColumnDef<AreaRow>[] = [
  { id: 'name', label: 'Name', type: 'text', width: 220, value: (a) => a.name, render: (a) => <span>{a.emoji ? `${a.emoji} ` : ''}{a.name}</span> },
  { id: 'projects', label: 'Projects', type: 'number', width: 100, value: (a) => a.projects, calc: 'sum', onCard: true },
  { id: 'openTasks', label: 'Open tasks', type: 'number', width: 110, value: (a) => a.openTasks, calc: 'sum', onCard: true },
  { id: 'overdue', label: 'Overdue', type: 'number', width: 100, value: (a) => a.overdue, tone: (a) => (a.overdue ? 'bad' : undefined), calc: 'sum' },
  { id: 'atRisk', label: 'At risk', type: 'number', width: 100, value: (a) => a.atRisk, tone: (a) => (a.atRisk ? 'bad' : undefined), calc: 'sum', onCard: true },
  { id: 'lastActivity', label: 'Last activity', type: 'date', width: 130, value: (a) => a.lastActivity },
  { id: 'description', label: 'Description', type: 'text', width: 260, hidden: true, value: (a) => a.description || null, onCard: true },
];

export function AllAreasScreen() {
  const formLink = useFormLink();
  const v = useLogic();
  const router = useRouter();
  const [archiving, setArchiving] = useState<AreaRow | null>(null);
  const open = (a: AreaRow) => router.push(`/areas/${a.id}`);

  return (
    <NotionPage
      title="Areas"
      icon={<MapIcon strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Areas', href: '/areas' }]}
      menu={[{ label: 'New area', href: formLink('area') }]}
      properties={[
        { id: 'areas', label: 'Areas', display: String(v.areas.length) },
        { id: 'projects', label: 'Active projects', display: String(v.activeProjects) },
        { id: 'tasks', label: 'Open tasks', display: String(v.openTasks) },
        { id: 'risk', label: 'At risk projects', tone: v.atRiskProjects ? 'bad' : 'good', display: String(v.atRiskProjects) },
      ]}
    >
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <Database<AreaRow>
          id="time.areas"
          label="Areas"
          noun={['area', 'areas']}
          rows={v.areas}
          rowKey={(a) => a.id}
          columns={COLUMNS}
          views={[
            { id: 'gallery', name: 'Gallery', layout: 'cards' },
            { id: 'table', name: 'Table', layout: 'table', hidden: ['description'] },
          ]}
          defaultGroup="none"
          card={{ title: (a) => a.name, render: (a) => <AreaCard area={a} onOpen={() => open(a)} onArchive={() => setArchiving(a)} /> }}
          list={{ title: (a) => a.name, secondary: (a) => figures(a), ownsProperties: true }}
          rowActions={[{ id: 'archive', label: 'Archive', run: (a) => setArchiving(a) }]}
          onOpen={open}
          onNew={() => router.push(formLink('area'))}
          newLabel="New area"
          emptyText="No areas yet. Areas group your projects (Work, Home, Health)."
        />
      )}
      {archiving && (
        <ConfirmDialog
          title={`Archive ${archiving.name}?`}
          message="Its projects keep their tasks; the area leaves the list."
          confirmLabel="Archive"
          cancelLabel="Keep"
          onCancel={() => setArchiving(null)}
          onConfirm={() => {
            const a = archiving;
            setArchiving(null);
            void v.archiveArea(a.id);
          }}
        />
      )}
    </NotionPage>
  );
}

function AreaCard({ area, onOpen, onArchive }: { area: AreaRow; onOpen: () => void; onArchive: () => void }) {
  const formLink = useFormLink();
  const router = useRouter();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  return (
    <article className={styles.card} onClick={onOpen}>
      <div className={styles.cardTop}>
        <span className={styles.tile} style={{ background: area.emoji ? undefined : area.color }} aria-hidden>
          {area.emoji ?? ''}
        </span>
        <button
          type="button"
          className={styles.more}
          aria-label={`Options for ${area.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(e.currentTarget);
          }}
        >
          <MoreHorizontal size={16} strokeWidth={2} />
        </button>
      </div>
      <h3 className={styles.name}>
        <button type="button" onClick={onOpen}>
          {area.name}
        </button>
      </h3>
      {area.description && <p className={styles.description}>{area.description}</p>}
      <p className={styles.figures} data-risk={area.atRisk > 0 || undefined}>
        {figures(area)}
      </p>
      {menu && (
        <Popover anchor={menu} label={area.name} onClose={() => setMenu(null)}>
          <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={onOpen}>
              Open
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                router.push(formLink('area', { id: area.id }));
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                onArchive();
              }}
            >
              Archive
            </button>
          </div>
        </Popover>
      )}
    </article>
  );
}
