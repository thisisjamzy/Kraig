'use client';

// The Projects database's shared description: properties, the gallery
// card, the list row and groupings, used by the Projects page and the area
// pages.
//
// The gallery card: the color dot and name, the date range, the
// description (two lines), the health tag, "1 overdue · 4 tasks", the area,
// and one continuous progress bar along the card's bottom edge (filled
// part in the health color, the rest light grey) with the percentage
// beside it. What shows follows the view's visible properties.

import type { ProjectHealth, ProjectRow } from '@/src/logic/projectsDb/useProjectsDb';
import { HEALTH_ORDER } from '@/src/logic/projectsDb/useProjectsDb';
import type { CardSpec } from '@/src/widgets/Database/CardsView';
import type { ColumnDef, GroupDef, ListSpec } from '@/src/widgets/Database/types';
import { Tag, TAG_ACCENT, type TagColor } from '@/src/widgets/TaskDb/Tag';
import styles from './ProjectDb.module.css';

export const HEALTH_COLOR: Record<ProjectHealth, TagColor> = { 'At risk': 'red', Watch: 'yellow', 'On track': 'green', Done: 'gray' };
const STATUS_COLOR: Record<string, TagColor> = { Active: 'blue', Completed: 'green', Archived: 'gray' };

export function healthAccent(h: ProjectHealth): string {
  return TAG_ACCENT[HEALTH_COLOR[h]];
}

const short = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);

export function dateRange(row: Pick<ProjectRow, 'start' | 'end'>): string | null {
  if (!row.start && !row.end) return null;
  if (row.start && row.end) {
    const sameYear = row.start.getFullYear() === row.end.getFullYear();
    return `${row.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} to ${row.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return row.end ? `Due ${short(row.end)}` : `From ${short(row.start)}`;
}

export function ProgressBar({ row }: { row: Pick<ProjectRow, 'progress' | 'health'> }) {
  const pct = Math.round(row.progress * 100);
  return (
    <span className={styles.progress}>
      <span className={styles.track} role="img" aria-label={`${pct}% done`}>
        <span style={{ width: `${pct}%`, background: healthAccent(row.health) }} />
      </span>
      <span className={styles.pct}>{pct}%</span>
    </span>
  );
}

export function HealthTag({ health }: { health: ProjectHealth }) {
  return (
    <Tag color={HEALTH_COLOR[health]} dot>
      {health}
    </Tag>
  );
}

function counts(row: ProjectRow) {
  const parts = [row.overdue ? `${row.overdue} overdue` : null, `${row.tasks} ${row.tasks === 1 ? 'task' : 'tasks'}`].filter(Boolean);
  return parts.join(' · ');
}

export function projectColumns(): ColumnDef<ProjectRow>[] {
  return [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 240,
      value: (r) => r.name,
      render: (r) => (
        <span className={styles.nameCell}>
          <span className={styles.dot} style={{ background: r.color }} aria-hidden />
          <span className={styles.nameText}>
            {r.emoji ? `${r.emoji} ` : ''}
            {r.name}
          </span>
        </span>
      ),
    },
    {
      id: 'health',
      label: 'Health',
      type: 'select',
      width: 120,
      onCard: true,
      value: (r) => r.health,
      options: HEALTH_ORDER.map((h) => ({ value: h, label: h })),
      render: (r) => <HealthTag health={r.health} />,
    },
    { id: 'progress', label: 'Progress', type: 'progress', width: 160, onCard: true, value: (r) => r.progress, render: (r) => <ProgressBar row={r} /> },
    { id: 'dates', label: 'Dates', type: 'text', width: 200, onCard: true, noQuery: true, value: (r) => dateRange(r) },
    { id: 'start', label: 'Start', type: 'date', width: 120, hidden: true, value: (r) => r.start },
    { id: 'end', label: 'End', type: 'date', width: 120, value: (r) => r.end },
    { id: 'tasks', label: 'Tasks', type: 'number', width: 90, onCard: true, value: (r) => r.tasks, calc: 'sum' },
    { id: 'overdue', label: 'Overdue', type: 'number', width: 100, value: (r) => r.overdue, tone: (r) => (r.overdue ? 'bad' : undefined), calc: 'sum' },
    { id: 'area', label: 'Area', type: 'text', width: 150, onCard: true, value: (r) => r.areaName, render: (r) => (r.areaName ? <Tag>{r.areaName}</Tag> : null) },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 120,
      hidden: true,
      value: (r) => r.status,
      options: ['Active', 'Completed', 'Archived'].map((s) => ({ value: s, label: s })),
      render: (r) => <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>,
    },
    { id: 'description', label: 'Description', type: 'text', width: 260, onCard: true, value: (r) => r.description || null },
    { id: 'lastActivity', label: 'Last activity', type: 'date', width: 130, value: (r) => r.lastActivity },
  ];
}

export function projectGroups(): GroupDef<ProjectRow>[] {
  return [
    { id: 'area', label: 'Area', key: (r) => ({ key: r.areaId ?? 'none', label: r.areaName ?? 'No area' }) },
    { id: 'health', label: 'Health', key: (r) => ({ key: r.health, label: r.health }), order: HEALTH_ORDER },
    { id: 'status', label: 'Status', key: (r) => ({ key: r.status, label: r.status }), order: ['Active', 'Completed', 'Archived'] },
  ];
}

/** The gallery card (and board card). */
export function projectCardSpec(onOpen: (row: ProjectRow) => void): CardSpec<ProjectRow> {
  return {
    title: (r) => r.name,
    render: (r, shown) => (
      <article className={styles.card} onClick={() => onOpen(r)}>
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>
            <span className={styles.dot} style={{ background: r.color }} aria-hidden />
            <button type="button" onClick={() => onOpen(r)}>
              {r.emoji ? `${r.emoji} ` : ''}
              {r.name}
            </button>
          </h3>
          {shown.has('dates') && dateRange(r) && <p className={styles.muted}>{dateRange(r)}</p>}
          {shown.has('description') && r.description && <p className={styles.description}>{r.description}</p>}
          <div className={styles.chips}>
            {shown.has('health') && <HealthTag health={r.health} />}
            {shown.has('area') && r.areaName && <Tag>{r.areaName}</Tag>}
            {shown.has('status') && r.status !== 'Active' && <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>}
          </div>
          {(shown.has('tasks') || shown.has('overdue')) && (
            <p className={styles.muted} data-alert={r.overdue > 0 || undefined}>
              {counts(r)}
            </p>
          )}
        </div>
        {shown.has('progress') && (
          <div className={styles.cardFoot}>
            <ProgressBar row={r} />
          </div>
        )}
      </article>
    ),
  };
}

/** Phones (and the List view): name and health, then dates and progress. */
export const projectListSpec: ListSpec<ProjectRow> = {
  title: (r) => r.name,
  leading: (r) => <span className={styles.dot} style={{ background: r.color }} aria-hidden />,
  ownsProperties: true,
  secondary: (r) => (
    <span className={styles.listMeta}>
      {dateRange(r) && <span>{dateRange(r)}</span>}
      <ProgressBar row={r} />
    </span>
  ),
  status: (r) => <HealthTag health={r.health} />,
};
