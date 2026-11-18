'use client';

// The Projects database's shared description (Dreda v1.0 `Projects` 57627,
// `Projects board` 58404): properties, the card, groupings.
//
// The card: the project's letter on its label hue, its name and "Area ›
// Folder"; health, priority and due; the brief; progress ("12 of 19 tasks ·
// 63%") in the hue; small badges for due this week, overdue and hours
// booked on the calendar this week; the next task; Block time. What shows
// follows the view's visible properties, so the board's compact card is
// the same card with fewer of them.

import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import type { ProjectHealth, ProjectRow } from '@/src/logic/projectsDb/useProjectsDb';
import { HEALTH_ORDER } from '@/src/logic/projectsDb/useProjectsDb';
import { crumbOf, STAGE_ORDER, type ProjectStat } from '@/src/viewmodels/organise';
import { hueVars, type LabelHue } from '@/src/viewmodels/projects';
import { dayText, durationText } from '@/src/viewmodels/todayPlan';
import type { CardSpec } from '@/src/widgets/Database/CardsView';
import type { ColumnDef, GroupDef, ListSpec } from '@/src/widgets/Database/types';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import { Avatar } from '@/src/widgets/People/People';
import type { Person } from '@/src/viewmodels/people';
import styles from './ProjectDb.module.css';

/** A Projects database row: the project and its v1.0 figures. */
export type ProjectCardRow = ProjectRow & ProjectStat;

export const HEALTH_HUE: Record<ProjectHealth, LabelHue> = { 'At risk': 'orange', Watch: 'amber', 'On track': 'green', Done: 'grey' };
export const STAGE_HUE: Record<ProjectStat['stage'], LabelHue> = { Planned: 'grey', 'In progress': 'purple', 'At risk': 'orange', Done: 'green' };

const short = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);

export function dateRange(row: Pick<ProjectRow, 'start' | 'end'>): string | null {
  if (!row.start && !row.end) return null;
  if (row.start && row.end) return `${short(row.start)} to ${row.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return row.end ? `Due ${short(row.end)}` : `From ${short(row.start)}`;
}

export function HealthTag({ health }: { health: ProjectHealth }) {
  const v = hueVars(HEALTH_HUE[health]);
  return (
    <span className={styles.chip} style={{ background: v.bg, color: v.fg }}>
      <span className={styles.chipDot} style={{ background: v.solid }} aria-hidden />
      {health}
    </span>
  );
}

function Grey({ children }: { children: React.ReactNode }) {
  return <span className={styles.greyChip}>{children}</span>;
}

/** The project's letter on its hue. */
export function LetterTile({ row, size = 36 }: { row: Pick<ProjectStat, 'letter' | 'hue'>; size?: number }) {
  const v = hueVars(row.hue);
  return (
    <span className={styles.letter} style={{ width: size, height: size, background: v.bg, color: v.fg }} aria-hidden>
      {row.letter}
    </span>
  );
}

export function HueProgress({ row }: { row: Pick<ProjectStat, 'hue' | 'progress'> }) {
  const pct = Math.round(row.progress * 100);
  return (
    <span className={styles.track} role="img" aria-label={`${pct}% done`}>
      <span style={{ width: `${pct}%`, background: hueVars(row.hue).solid }} />
    </span>
  );
}

export function projectColumns(): ColumnDef<ProjectCardRow>[] {
  return [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 260,
      value: (r) => r.name,
      render: (r) => (
        <span className={styles.nameCell}>
          <LetterTile row={r} size={28} />
          <span className={styles.nameText}>{r.name}</span>
        </span>
      ),
    },
    { id: 'health', label: 'Health', type: 'select', width: 120, onCard: true, value: (r) => r.health, options: HEALTH_ORDER.map((h) => ({ value: h, label: h })), render: (r) => <HealthTag health={r.health} /> },
    { id: 'stage', label: 'Stage', type: 'select', width: 120, value: (r) => r.stage, options: STAGE_ORDER.map((s) => ({ value: s, label: s })), render: (r) => <HueTag hue={STAGE_HUE[r.stage]}>{r.stage}</HueTag> },
    { id: 'priority', label: 'Priority', type: 'select', width: 140, onCard: true, value: (r) => r.priorityText, options: ['Urgent', 'High', 'Medium', 'Low'].map((p) => ({ value: `${p} priority`, label: p })) },
    { id: 'progress', label: 'Progress', type: 'progress', width: 160, onCard: true, value: (r) => r.progress, render: (r) => <HueProgress row={r} /> },
    { id: 'dates', label: 'Dates', type: 'text', width: 200, noQuery: true, value: (r) => dateRange(r) },
    { id: 'start', label: 'Start', type: 'date', width: 120, hidden: true, value: (r) => r.start },
    { id: 'end', label: 'Due', type: 'date', width: 120, onCard: true, value: (r) => r.end },
    { id: 'tasks', label: 'Task counts', type: 'number', width: 100, onCard: true, value: (r) => r.open, calc: 'sum' },
    { id: 'overdue', label: 'Overdue', type: 'number', width: 100, value: (r) => r.overdue, tone: (r) => (r.overdue ? 'bad' : undefined), calc: 'sum' },
    { id: 'blocked', label: 'Blocked this week', type: 'number', width: 140, value: (r) => Math.round(r.weekMinutes / 60), calc: 'sum' },
    { id: 'area', label: 'Area', type: 'text', width: 150, value: (r) => r.areaName },
    { id: 'folder', label: 'Folder', type: 'text', width: 150, value: (r) => r.folderName },
    { id: 'status', label: 'Status', type: 'select', width: 120, hidden: true, value: (r) => r.status, options: ['Active', 'Completed', 'Archived'].map((s) => ({ value: s, label: s })) },
    { id: 'description', label: 'Brief', type: 'text', width: 260, onCard: true, value: (r) => r.description || null },
    { id: 'next', label: 'Next up', type: 'text', width: 220, onCard: true, noQuery: true, value: (r) => r.nextUp?.title ?? null },
    { id: 'people', label: 'People', type: 'text', width: 160, onCard: true, noQuery: true, value: () => null },
    { id: 'block', label: 'Block time button', type: 'text', width: 100, onCard: true, noQuery: true, value: () => null },
    { id: 'lastActivity', label: 'Last activity', type: 'date', width: 130, value: (r) => r.lastActivity },
  ];
}

export function projectGroups(): GroupDef<ProjectCardRow>[] {
  return [
    { id: 'folder', label: 'Folder', key: (r) => ({ key: r.folderId ?? 'none', label: r.folderName ?? r.areaName ?? 'No folder' }) },
    { id: 'area', label: 'Area', key: (r) => ({ key: r.areaId ?? 'none', label: r.areaName ?? 'No area' }) },
    { id: 'stage', label: 'Stage', key: (r) => ({ key: r.stage, label: r.stage }), order: STAGE_ORDER },
    { id: 'health', label: 'Health', key: (r) => ({ key: r.health, label: r.health }), order: HEALTH_ORDER },
    { id: 'status', label: 'Status', key: (r) => ({ key: r.status, label: r.status }), order: ['Active', 'Completed', 'Archived'] },
  ];
}

/** The project card (gallery and board). */
/** Faces of the people on a project, overlapping. */
export function Faces({ people, max = 3 }: { people: Person[]; max?: number }) {
  if (!people.length) return null;
  return (
    <span className={styles.faces}>
      {people.slice(0, max).map((p) => (
        <span key={p.id} className={styles.face} title={p.name}>
          <Avatar id={p.avatarId} size={30} alt={p.name} />
        </span>
      ))}
    </span>
  );
}

export function projectCardSpec(onOpen: (row: ProjectCardRow) => void, peopleFor: (row: ProjectCardRow) => Person[] = () => []): CardSpec<ProjectCardRow> {
  return {
    title: (r) => r.name,
    render: (r, shown) => {
      const now = new Date();
      const pct = Math.round(r.progress * 100);
      const compact = !shown.has('priority') && !shown.has('next');
      const people = shown.has('people') ? peopleFor(r) : [];
      return (
        <article className={styles.card} data-compact={compact || undefined} onClick={() => onOpen(r)}>
          <header className={styles.cardHead}>
            <LetterTile row={r} />
            <span className={styles.cardName}>
              <button type="button" className={styles.cardTitle} onClick={() => onOpen(r)}>
                {r.name}
              </button>
              {crumbOf(r) && <span className={styles.crumb}>{crumbOf(r)}</span>}
            </span>
          </header>
          {!compact && (shown.has('health') || shown.has('priority') || shown.has('end')) && (
            <div className={styles.chips}>
              {shown.has('health') && <HealthTag health={r.health} />}
              {shown.has('priority') && <Grey>{r.priorityText}</Grey>}
              {shown.has('end') && r.end && <span className={styles.due}>Due {short(r.end)}</span>}
            </div>
          )}
          {shown.has('description') && r.description && <p className={styles.description}>{r.description}</p>}
          {shown.has('progress') &&
            (compact ? (
              <div className={styles.progressRow}>
                <HueProgress row={r} />
                <span className={styles.count}>
                  {r.done}/{r.total}
                </span>
              </div>
            ) : (
              <div className={styles.progressBlock}>
                <span className={styles.progressHead}>
                  <span>Progress</span>
                  <span>
                    {r.done} of {r.total} tasks · {pct}%
                  </span>
                </span>
                <HueProgress row={r} />
              </div>
            ))}
          {compact ? (
            <div className={styles.chips}>
              {r.end && <Grey>Due {short(r.end)}</Grey>}
              {r.overdue > 0 && <span className={styles.late}>{r.overdue} overdue</span>}
              {people[0] && (
                <span className={styles.oneFace}>
                  <Faces people={people} max={1} />
                </span>
              )}
            </div>
          ) : (
            shown.has('tasks') &&
            (r.dueWeek > 0 || r.overdue > 0 || r.weekMinutes > 0) && (
              <div className={styles.chips}>
                {r.overdue > 0 && <span className={styles.late}>{r.overdue} overdue</span>}
                {r.dueWeek > 0 && <Grey>{r.dueWeek} due this week</Grey>}
                {r.weekMinutes > 0 && <Grey>{durationText(r.weekMinutes)} blocked</Grey>}
              </div>
            )
          )}
          {!compact && shown.has('next') && r.nextUp && (
            <div className={styles.next}>
              <CircleCheck size={18} strokeWidth={2} aria-hidden />
              <span className={styles.nextText}>
                <span className={styles.nextLabel}>Next up</span>
                <span className={styles.nextTitle}>{r.nextUp.title}</span>
              </span>
              {r.nextUp.date && <span className={r.nextUp.overdue ? styles.nextLate : styles.nextDate}>{dayText(r.nextUp.date, now)}</span>}
            </div>
          )}
          {!compact && ((shown.has('block') && r.open > 0) || people.length > 0) && (
            <div className={styles.cardFoot}>
              {people.length > 0 && (
                <span className={styles.peopleRow}>
                  <Faces people={people} />
                  <span className={styles.peopleCount}>{people.length === 1 ? '1 person' : `${people.length} people`}</span>
                </span>
              )}
              {shown.has('block') && r.open > 0 && (
                <Link href="/projects/calendar" className={styles.tonal} onClick={(e) => e.stopPropagation()}>
                  Block time
                </Link>
              )}
            </div>
          )}
        </article>
      );
    },
  };
}

/** Phones (and the List view): name and crumb, then progress. */
export const projectListSpec: ListSpec<ProjectCardRow> = {
  title: (r) => r.name,
  leading: (r) => <LetterTile row={r} size={28} />,
  ownsProperties: true,
  secondary: (r) => (
    <span className={styles.listMeta}>
      {crumbOf(r) && <span>{crumbOf(r)}</span>}
      <HueProgress row={r} />
    </span>
  ),
  status: (r) => <HealthTag health={r.health} />,
};
