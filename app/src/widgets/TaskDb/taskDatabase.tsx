'use client';

// The Tasks database's shared description: its properties (columns), how
// a task reads as a list row and as a card, its groupings and row actions.
// Every task view in the Time module (Today, Focus, Calendar, project and
// area pages) builds its Database from these, so they look and behave the
// same everywhere.
//
// Properties: Name, Status, Importance, Priority, Type, Project, Area,
// Date, Time, Start, End, Time mode, Recurring, Overdue, Google sync,
// Created, Completed.

import { useState } from 'react';
import { Check, Layers, Lock, Repeat } from 'lucide-react';
import { askActualTime } from '@/src/widgets/ActualTimePrompt/ActualTimePrompt';
import { PRIORITY_LABEL, PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import { QUADRANTS, QUADRANT_BY_ID } from '@/src/viewmodels/eisenhower';
import { IMPORTANCE_ORDER, STATUS_ORDER, TYPE_LABEL, timeText, type TaskRow, type TaskRowStatus, type TaskRowType } from '@/src/viewmodels/taskRow';
import type { TasksDb } from '@/src/logic/tasksDb/useTasksDb';
import type { Quadrant, TimeMode } from '@/src/shared/firestore/types';
import type { CardSpec } from '@/src/widgets/Database/CardsView';
import type { ColumnDef, GroupDef, ListSpec, RowAction } from '@/src/widgets/Database/types';
import { Tag, TAG_ACCENT, type TagColor } from './Tag';
import styles from './TaskDb.module.css';

export const IMPORTANCE_COLOR: Record<Quadrant, TagColor> = { do: 'red', schedule: 'blue', delegate: 'yellow', eliminate: 'gray' };
export const STATUS_COLOR: Record<TaskRowStatus, TagColor> = { Pending: 'gray', Done: 'green', Cancelled: 'brown' };
export const TYPE_COLOR: Record<TaskRowType, TagColor> = { ToDo: 'blue', Meeting: 'purple', Event: 'orange' };
const PRIORITY_COLOR: Record<string, TagColor> = { Urgent: 'red', High: 'orange', Medium: 'gray', Low: 'gray' };

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function importanceDot(q: string): string | null {
  return q in IMPORTANCE_COLOR ? TAG_ACCENT[IMPORTANCE_COLOR[q as Quadrant]] : null;
}

/** The circle checkbox: ticks the task done (or back). */
export function TaskCheck({ row, db }: { row: TaskRow; db: TasksDb }) {
  const [saving, setSaving] = useState(false);
  async function toggle() {
    if (saving) return;
    setSaving(true);
    try {
      await db.actions.setDone(row, !row.done);
      if (!row.done && !row.allDay && row.minutes > 0) askActualTime({ taskId: row.id, title: row.title, estimateMinutes: row.minutes });
    } finally {
      setSaving(false);
    }
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={row.done}
      aria-label={row.done ? `Mark ${row.title} as not done` : `Mark ${row.title} as done`}
      className={styles.check}
      data-cancelled={row.status === 'Cancelled' || undefined}
      onClick={(e) => {
        e.stopPropagation();
        void toggle();
      }}
      disabled={saving}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}

export function ModeGlyph({ mode }: { mode: TimeMode }) {
  return mode === 'blocked' ? (
    <Lock size={11} strokeWidth={2.25} aria-label="Blocked time" role="img" />
  ) : (
    <Layers size={11} strokeWidth={2.25} aria-label="Free time" role="img" />
  );
}

/** "9:00 to 10:30" with the blocked or free icon (and the day when asked). */
export function TaskWhen({ row, withDate = false }: { row: TaskRow; withDate?: boolean }) {
  const time = timeText(row);
  const day = withDate && row.date ? row.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  const text = [day, row.allDay && day ? null : time].filter(Boolean).join(', ');
  if (!text) return null;
  return (
    <span className={styles.when} data-overdue={row.overdue || undefined}>
      {text}
      {!row.allDay && time && <ModeGlyph mode={row.timeMode} />}
      {row.recurring && <Repeat size={11} strokeWidth={2.25} aria-label="Repeats" role="img" />}
    </span>
  );
}

export function ProjectLabel({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return null;
  return (
    <span className={styles.project}>
      <span className={styles.projectDot} style={{ background: color ?? '#a5a49f' }} aria-hidden />
      {name}
    </span>
  );
}

export function ImportanceTag({ q }: { q: Quadrant }) {
  return (
    <Tag color={IMPORTANCE_COLOR[q]} dot>
      {QUADRANT_BY_ID[q].label}
    </Tag>
  );
}

const clock = (d: Date | null) => (d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null);

export function taskColumns(db: TasksDb): ColumnDef<TaskRow>[] {
  const projectOptions = [...db.projects.values()]
    .filter((p) => p.status !== 'Archived')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name }));
  return [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 280,
      value: (r) => r.title,
      edit: (r, next) => db.actions.setTitle(r, String(next ?? '')),
      render: (r) => (
        <span className={styles.nameCell}>
          <TaskCheck row={r} db={db} />
          <span className={styles.nameText} data-done={r.done || undefined}>
            {r.emoji ? `${r.emoji} ` : ''}
            {r.title}
          </span>
        </span>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 120,
      value: (r) => r.status,
      options: STATUS_ORDER.map((s) => ({ value: s, label: s })),
      edit: (r, next) => db.actions.setStatus(r, next as TaskRowStatus),
      render: (r) => <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>,
    },
    {
      id: 'importance',
      label: 'Importance',
      type: 'select',
      width: 140,
      onCard: true,
      value: (r) => r.importance,
      options: QUADRANTS.map((q) => ({ value: q.id, label: q.label })),
      edit: (r, next) => db.actions.setImportance(r, next as Quadrant),
      render: (r) => <ImportanceTag q={r.importance} />,
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      width: 130,
      hidden: true,
      value: (r) => r.priority,
      options: PRIORITY_LEVELS.map((p) => ({ value: p, label: sentence(PRIORITY_LABEL[p]) })),
      render: (r) => <Tag color={PRIORITY_COLOR[r.priority]}>{sentence(PRIORITY_LABEL[r.priority])}</Tag>,
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      width: 110,
      hidden: true,
      value: (r) => r.type,
      options: (Object.keys(TYPE_LABEL) as TaskRowType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] })),
      edit: (r, next) => db.actions.setType(r, next as TaskRowType),
      render: (r) => <Tag color={TYPE_COLOR[r.type]}>{TYPE_LABEL[r.type]}</Tag>,
    },
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      width: 120,
      value: (r) => r.date,
      edit: (r, next) => (next instanceof Date ? db.actions.setDate(r, next) : undefined),
      editable: (r) => r.date !== null,
      tone: (r) => (r.overdue ? 'bad' : undefined),
    },
    {
      id: 'time',
      label: 'Time',
      type: 'text',
      width: 150,
      onCard: true,
      noQuery: true,
      value: (r) => timeText(r),
      render: (r) => <TaskWhen row={r} />,
    },
    { id: 'start', label: 'Start', type: 'text', width: 90, hidden: true, value: (r) => (r.allDay ? null : clock(r.start)) },
    { id: 'end', label: 'End', type: 'text', width: 90, hidden: true, value: (r) => (r.allDay ? null : clock(r.end)) },
    {
      id: 'project',
      label: 'Project',
      type: 'relation',
      width: 170,
      onCard: true,
      value: (r) => r.projectId,
      options: projectOptions,
      edit: (r, next) => db.actions.setProject(r, (next as string | null) || null),
      editable: (r) => !r.recurring,
      render: (r) => <ProjectLabel name={r.projectName} color={r.projectColor} />,
    },
    { id: 'area', label: 'Area', type: 'text', width: 140, hidden: true, value: (r) => r.areaName },
    {
      id: 'timeMode',
      label: 'Time mode',
      type: 'select',
      width: 110,
      hidden: true,
      value: (r) => (r.allDay ? null : r.timeMode),
      options: [
        { value: 'blocked', label: 'Blocked' },
        { value: 'free', label: 'Free' },
      ],
      edit: (r, next) => db.actions.setTimeMode(r, next as TimeMode),
      editable: (r) => !r.allDay,
    },
    { id: 'recurring', label: 'Recurring', type: 'checkbox', width: 100, hidden: true, value: (r) => r.recurring },
    {
      id: 'overdue',
      label: 'Overdue',
      type: 'checkbox',
      width: 100,
      onCard: true,
      value: (r) => r.overdue,
      render: (r) => (r.overdue ? <Tag color="red">Overdue</Tag> : null),
    },
    { id: 'sync', label: 'Google sync', type: 'text', width: 120, hidden: true, value: (r) => r.sync },
    { id: 'created', label: 'Created', type: 'date', width: 120, hidden: true, value: (r) => r.created },
    { id: 'completed', label: 'Completed', type: 'date', width: 120, hidden: true, value: (r) => r.completed },
  ];
}

/** Groupings: Status (with Anytime for undated or date-only to-dos when
 * asked), Importance, Project, Area, Type. */
export function taskGroups({ anytime = false }: { anytime?: boolean } = {}): GroupDef<TaskRow>[] {
  return [
    {
      id: 'status',
      label: 'Status',
      key: (r) => (anytime && r.status === 'Pending' && (r.allDay || !r.date) ? { key: 'Anytime', label: 'Anytime' } : { key: r.status, label: r.status }),
      order: anytime ? ['Pending', 'Done', 'Cancelled', 'Anytime'] : STATUS_ORDER,
    },
    {
      id: 'importance',
      label: 'Importance',
      key: (r) => ({ key: r.importance, label: QUADRANT_BY_ID[r.importance].label }),
      order: IMPORTANCE_ORDER,
    },
    { id: 'project', label: 'Project', key: (r) => ({ key: r.projectId ?? 'none', label: r.projectName ?? 'No project' }) },
    { id: 'area', label: 'Area', key: (r) => ({ key: r.areaId ?? 'none', label: r.areaName ?? 'No area' }) },
    { id: 'type', label: 'Type', key: (r) => ({ key: r.type, label: TYPE_LABEL[r.type] }), order: ['ToDo', 'Meeting', 'Event'] },
  ];
}

/** A task as a list row: circle checkbox, name; time with its mode icon
 * and the project as a muted label; the importance tag on the right. What
 * shows follows the view's visible properties. */
export function taskListSpec(db: TasksDb, { withDate = false, highlight = null }: { withDate?: boolean; highlight?: string | null } = {}): ListSpec<TaskRow> {
  return {
    title: (r) => r.title,
    leading: (r) => <TaskCheck row={r} db={db} />,
    ownsProperties: true,
    highlight,
    secondary: (r, shown) => {
      const when = shown.has('time') || shown.has('date') ? <TaskWhen row={r} withDate={withDate || shown.has('date')} /> : null;
      const project = shown.has('project') ? <ProjectLabel name={r.projectName} color={r.projectColor} /> : null;
      if (!when && !project) return null;
      return (
        <span className={styles.meta}>
          {when}
          {project}
        </span>
      );
    },
    status: (r, shown) => (
      <>
        {shown.has('overdue') && r.overdue && <Tag color="red">Overdue</Tag>}
        {shown.has('importance') && <ImportanceTag q={r.importance} />}
        {shown.has('status') && r.status !== 'Pending' && <Tag color={STATUS_COLOR[r.status]}>{r.status}</Tag>}
        {shown.has('type') && <Tag color={TYPE_COLOR[r.type]}>{TYPE_LABEL[r.type]}</Tag>}
      </>
    ),
  };
}

/** A task card (Board, Cards): checkbox and name, then the visible
 * properties as bare values. */
export function taskCardSpec(db: TasksDb): CardSpec<TaskRow> {
  return {
    title: (r) => r.title,
    leading: (r) => <TaskCheck row={r} db={db} />,
    bare: true,
  };
}

export function taskRowActions(db: TasksDb): RowAction<TaskRow>[] {
  return [
    { id: 'done', label: 'Mark done', show: (r) => r.status === 'Pending', run: (r) => db.actions.setDone(r, true) },
    { id: 'tomorrow', label: 'Move to tomorrow', show: (r) => r.status === 'Pending' && r.date !== null, run: (r) => db.actions.setDate(r, new Date(Date.now() + 86_400_000)) },
    { id: 'reopen', label: 'Mark pending', show: (r) => r.status !== 'Pending', run: (r) => db.actions.setStatus(r, 'Pending') },
    { id: 'cancel', label: 'Cancel task', show: (r) => r.status === 'Pending', run: (r) => db.actions.setStatus(r, 'Cancelled') },
  ];
}
