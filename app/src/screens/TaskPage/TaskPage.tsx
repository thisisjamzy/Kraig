'use client';

// A task as a Notion page: its side peek (medium screens and up, from any
// task view) and its full page on the web. The title with a circle
// checkbox, then properties edited in place: Status, Importance, Type,
// Date, Start and End (with the availability check under them), Time mode,
// Repeat, Project, Area, Google sync, Created. Then the subtasks checklist
// and the notes. Repeat rules and other details open the task form ("Open
// in form"). Phones keep the form for creating and editing.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Maximize2, MoreHorizontal, Plus, X } from 'lucide-react';
import { useTasksDb, type TasksDb } from '@/src/logic/tasksDb/useTasksDb';
import { describeSeries, expandTasks, occurrenceFor, parseOccurrenceId, type TaskItem } from '@/src/shared/tasks/recurringTasks';
import { checkAvailability, type ScheduledTask } from '@/src/viewmodels/scheduling';
import { QUADRANTS } from '@/src/viewmodels/eisenhower';
import { STATUS_ORDER, TYPE_LABEL, type TaskRow, type TaskRowStatus, type TaskRowType } from '@/src/viewmodels/taskRow';
import { newId } from '@/src/shared/listQuery/engine';
import type { Quadrant, TaskSubtask, TimeMode } from '@/src/shared/firestore/types';
import { PropertiesBlock, type Property } from '@/src/widgets/Database/PropertiesBlock';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { AvailabilityRow } from '@/src/screens/TaskEdit/TaskEditScreen';
import { ImportanceTag, ProjectLabel, STATUS_COLOR, TaskCheck, TYPE_COLOR } from '@/src/widgets/TaskDb/taskDatabase';
import { Tag } from '@/src/widgets/TaskDb/Tag';
import { useBreadcrumb, useOwnsTitle } from '@/src/widgets/AppShell/breadcrumb';
import styles from './TaskPage.module.css';

function findTask(db: TasksDb, id: string): TaskItem | null {
  const occurrence = parseOccurrenceId(id);
  if (occurrence) {
    const series = db.taskDocs.find((t) => t.id === occurrence.seriesId);
    return series ? occurrenceFor(series, occurrence.key) : null;
  }
  return db.taskDocs.find((t) => t.id === id) ?? null;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The task page's body (title, properties, subtasks, notes). */
export function TaskPageBody({ taskId, db }: { taskId: string; db: TasksDb }) {
  const item = useMemo(() => findTask(db, taskId), [db, taskId]);
  const row = useMemo(() => (item ? db.toRow(item) : null), [db, item]);
  const series = useMemo(() => {
    const occurrence = parseOccurrenceId(taskId);
    return occurrence ? (db.taskDocs.find((t) => t.id === occurrence.seriesId) ?? null) : null;
  }, [db.taskDocs, taskId]);
  const [timeEditor, setTimeEditor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (db.loading) return <ScreenState loading />;
  if (!item || !row) return <p className={styles.muted}>This task no longer exists.</p>;

  const run = (fn: () => Promise<unknown> | void) => {
    setError(null);
    Promise.resolve(fn()).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not save that.'));
  };

  // Availability: the same day's other timed tasks.
  let availability = null;
  if (row.start && row.end && !row.allDay && row.status === 'Pending') {
    const day = new Date(row.start.getFullYear(), row.start.getMonth(), row.start.getDate());
    const sameDay: ScheduledTask[] = expandTasks(db.taskDocs, day, new Date(day.getTime() + 86_399_999))
      .map((t) => db.toRow(t))
      .filter((r) => r.id !== row.id && r.status !== 'Cancelled' && !r.allDay && r.date?.getTime() === day.getTime())
      .map((r) => ({ id: r.id, title: r.title, start: r.start, end: r.end, mode: r.timeMode, allDay: false, seriesId: r.seriesId ?? undefined }));
    availability = checkAvailability(row.start, row.end, row.timeMode, row.seriesId ?? row.id, sameDay);
  }

  const projectOptions = [...db.projects.values()]
    .filter((p) => p.status !== 'Archived')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name }));

  const properties: Property[] = [
    {
      id: 'status',
      label: 'Status',
      display: <Tag color={STATUS_COLOR[row.status]}>{row.status}</Tag>,
      edit: { type: 'select', value: row.status, options: STATUS_ORDER.map((s) => ({ value: s, label: s })), onSave: (v) => db.actions.setStatus(row, v as TaskRowStatus) },
    },
    {
      id: 'importance',
      label: 'Importance',
      display: <ImportanceTag q={row.importance} />,
      edit: { type: 'select', value: row.importance, options: QUADRANTS.map((q) => ({ value: q.id, label: q.label })), onSave: (v) => db.actions.setImportance(row, v as Quadrant) },
    },
    {
      id: 'type',
      label: 'Type',
      display: <Tag color={TYPE_COLOR[row.type]}>{TYPE_LABEL[row.type]}</Tag>,
      edit: {
        type: 'select',
        value: row.type,
        options: (Object.keys(TYPE_LABEL) as TaskRowType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] })),
        onSave: (v) => db.actions.setType(row, v as TaskRowType),
      },
    },
    {
      id: 'date',
      label: 'Date',
      display: row.date ? row.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : undefined,
      edit: { type: 'date', value: row.date, onSave: (v) => (v instanceof Date ? db.actions.setDate(row, v) : undefined) },
    },
    {
      id: 'time',
      label: 'Start and end',
      display: (
        <button type="button" className={styles.inlineButton} onClick={(e) => setTimeEditor(e.currentTarget)}>
          {row.allDay || !row.start ? 'All day' : `${hhmm(row.start)} to ${row.end ? hhmm(row.end) : ''}`}
        </button>
      ),
    },
    ...(row.allDay
      ? []
      : [
          {
            id: 'mode',
            label: 'Time mode',
            edit: {
              type: 'select' as const,
              value: row.timeMode,
              options: [
                { value: 'blocked', label: 'Blocked' },
                { value: 'free', label: 'Free' },
              ],
              onSave: (v: unknown) => db.actions.setTimeMode(row, v as TimeMode),
            },
          },
        ]),
    {
      id: 'repeat',
      label: 'Repeat',
      display: series ? (describeSeries(series) ?? 'Repeats') : "Doesn't repeat",
    },
    {
      id: 'project',
      label: 'Project',
      display: row.projectName ? <ProjectLabel name={row.projectName} color={row.projectColor} /> : undefined,
      empty: !row.projectName,
      edit: row.recurring ? undefined : { type: 'relation', value: row.projectId, options: [{ value: '', label: 'No project' }, ...projectOptions], onSave: (v) => db.actions.setProject(row, (v as string) || null) },
    },
    { id: 'area', label: 'Area', display: row.areaName ?? undefined, empty: !row.areaName },
    { id: 'sync', label: 'Google sync', display: row.sync ?? 'Not synced', empty: false },
    { id: 'created', label: 'Created', display: row.created ? row.created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined },
  ];

  return (
    <div className={styles.body}>
      <h1 className={styles.title}>
        <TaskCheck row={row} db={db} />
        <TitleInput row={row} db={db} />
      </h1>
      <PropertiesBlock properties={properties} />
      {availability && (
        <div className={styles.availability}>
          <AvailabilityRow
            availability={availability}
            unchangedSchedule={false}
            onPickSlot={(slot) => run(() => db.actions.setTimes(row, slot.start, slot.end))}
            onTryTomorrow={() => run(() => db.actions.setDate(row, new Date(row.start!.getTime() + 86_400_000)))}
          />
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Subtasks row={row} list={item.subtasks ?? series?.subtasks ?? []} db={db} />
      <Notes row={row} db={db} />
      {timeEditor && <TimeEditor anchor={timeEditor} row={row} onClose={() => setTimeEditor(null)} onSave={(start, end, allDay) => run(() => db.actions.setTimes(row, start, end, allDay))} />}
    </div>
  );
}

function TitleInput({ row, db }: { row: TaskRow; db: TasksDb }) {
  const [value, setValue] = useState(row.title);
  const [prev, setPrev] = useState(row.title);
  if (row.title !== prev) {
    setPrev(row.title);
    setValue(row.title);
  }
  return (
    <input
      className={styles.titleInput}
      value={value}
      aria-label="Task name"
      data-done={row.done || undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== row.title && void db.actions.setTitle(row, value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function TimeEditor({ anchor, row, onClose, onSave }: { anchor: HTMLElement; row: TaskRow; onClose: () => void; onSave: (start: Date, end: Date, allDay: boolean) => void }) {
  const day = row.date ?? new Date();
  const [allDay, setAllDay] = useState(row.allDay);
  const [start, setStart] = useState(row.start && !row.allDay ? hhmm(row.start) : '09:00');
  const [end, setEnd] = useState(row.end && !row.allDay ? hhmm(row.end) : '10:00');
  const at = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
  };
  const valid = allDay || at(end) > at(start);
  return (
    <Popover anchor={anchor} label="Start and end" onClose={onClose}>
      <form
        className={styles.timeForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          if (allDay) onSave(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59), true);
          else onSave(at(start), at(end), false);
          onClose();
        }}
      >
        <label className={styles.check}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        {!allDay && (
          <div className={styles.timeRow}>
            <label>
              Start
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              End
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        )}
        {!valid && <p className={styles.error}>The end needs to be after the start.</p>}
        <button type="submit" className={styles.primary} disabled={!valid}>
          Save
        </button>
      </form>
    </Popover>
  );
}

function Subtasks({ row, list, db }: { row: TaskRow; list: TaskSubtask[]; db: TasksDb }) {
  const [draft, setDraft] = useState('');
  const save = (next: TaskSubtask[]) => void db.actions.setSubtasks(row, next);
  const done = list.filter((s) => s.done).length;
  return (
    <section className={styles.block} aria-label="Subtasks">
      <h2 className={styles.blockTitle}>
        Subtasks {list.length > 0 && <span className={styles.count}>{done} of {list.length}</span>}
      </h2>
      <ul className={styles.checklist}>
        {list.map((s) => (
          <li key={s.id}>
            <input type="checkbox" checked={s.done} onChange={() => save(list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} aria-label={s.title} />
            <span data-done={s.done || undefined}>{s.title}</span>
            <button type="button" className={styles.iconButton} aria-label={`Remove ${s.title}`} onClick={() => save(list.filter((x) => x.id !== s.id))}>
              <X size={14} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className={styles.addRow}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          save([...list, { id: newId('s'), title: draft.trim(), done: false }]);
          setDraft('');
        }}
      >
        <Plus size={14} strokeWidth={2} aria-hidden />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a subtask" aria-label="Add a subtask" />
      </form>
    </section>
  );
}

function Notes({ row, db }: { row: TaskRow; db: TasksDb }) {
  const [value, setValue] = useState(row.notes);
  const [prev, setPrev] = useState(row.notes);
  if (row.notes !== prev) {
    setPrev(row.notes);
    setValue(row.notes);
  }
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <section className={styles.block} aria-label="Notes">
      <h2 className={styles.blockTitle}>Notes</h2>
      <textarea
        ref={ref}
        className={styles.notes}
        value={value}
        placeholder="Write anything about this task"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== row.notes && void db.actions.setNotes(row, value)}
        rows={3}
      />
    </section>
  );
}

/** The side peek around the task page, with "Open as full page", "Open in form" and archive. */
export function TaskPeek({ taskId, onClose, fullHref, formHref }: { taskId: string; onClose: () => void; fullHref: string; formHref: string }) {
  const db = useTasksDb();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[data-lq-portal]')) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.overlay}>
      <button type="button" className={styles.backdrop} aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={ref} className={styles.peek} role="dialog" aria-modal="true" aria-label="Task" tabIndex={-1} data-panel-open>
        <div className={styles.peekBar}>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X size={17} strokeWidth={2} />
          </button>
          <Link href={fullHref} className={styles.iconButton} aria-label="Open as full page" title="Open as full page">
            <Maximize2 size={15} strokeWidth={2} />
          </Link>
          <span className={styles.spacer} />
          <button type="button" className={styles.iconButton} aria-label="Task options" onClick={(e) => setMenu(e.currentTarget)}>
            <MoreHorizontal size={17} strokeWidth={2} />
          </button>
        </div>
        <TaskPageBody taskId={taskId} db={db} />
      </div>
      {menu && (
        <Popover anchor={menu} label="Task options" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            <Link href={formHref} className={styles.menuRow} onClick={() => setMenu(null)}>
              Open in form
            </Link>
            <button
              type="button"
              className={styles.menuRow}
              onClick={() => {
                setMenu(null);
                setConfirm(true);
              }}
            >
              Archive task
            </button>
          </div>
        </Popover>
      )}
      {confirm && (
        <ConfirmDialog
          title="Archive this task?"
          message="It leaves every list. A date of a repeating task is removed from the series."
          confirmLabel="Archive"
          cancelLabel="Keep"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void db.actions.archive({ id: taskId }).then(onClose);
          }}
        />
      )}
    </div>
  );
}

/** The web full page (/tasks/<id>/edit on medium screens and up). */
export function TaskFullPage({ taskId }: { taskId: string }) {
  const db = useTasksDb();
  const item = findTask(db, taskId);
  const project = item?.projectId ? db.projects.get(item.projectId) : undefined;
  useBreadcrumb([
    { label: 'Time', href: '/projects' },
    ...(project ? [{ label: project.name, href: `/projects/${item!.projectId}` }] : [{ label: 'Focus', href: '/projects/focus' }]),
    { label: item?.title ?? 'Task' },
  ]);
  useOwnsTitle(true);
  return (
    <div className={styles.full}>
      <TaskPageBody taskId={taskId} db={db} />
      <p className={styles.muted}>
        <Link href={`/tasks/${encodeURIComponent(taskId)}/edit?form=1`}>Open in form</Link> to change how it repeats.
      </p>
    </div>
  );
}
