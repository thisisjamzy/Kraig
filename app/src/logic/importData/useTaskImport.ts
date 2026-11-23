'use client';

// Importing a task list (owner, 23 Nov 2026): one sheet, one task per row,
// each row saying where it belongs. The decisions are pure
// (src/shared/import/taskList.ts); this hook reads the file and what
// already exists, holds the person's choices, checks blocked tasks' time
// against the calendar, writes in batches of up to 450 tagged with an
// import id (areas, then folders, then projects, then tasks), keeps a log
// for Undo and the report, syncs Google Calendar once and leaves one
// notification.
//
// Steps: upload > columns (skipped when the headers are the template's) >
// check > importing > done.

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areaRef, areasRef, projectRef, projectsRef, sectionRef, sectionsRef, taskRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultSectionId, ensureDefaultSection } from '@/src/shared/firestore/sections';
import { newTaskDoc } from '@/src/shared/firestore/taskWrites';
import { applyNotificationWrites } from '@/src/shared/firestore/notificationWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useTimeZone } from '@/src/shared/hooks/useAccountability';
import { usePreferences } from '@/src/shared/firestore/preferences';
import { runCalendarSync } from '@/src/shared/calendarSync/runner';
import { checkAvailability, defaultTimeMode } from '@/src/viewmodels/scheduling';
import { buildScheduledTasks } from '@/src/logic/taskEdit/useLogic';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import { downloadTaskListTemplate } from '@/src/logic/importData/taskListTemplate';
import {
  MAX_ROWS,
  cellText,
  detectOrder,
  mapColumns,
  matchesTemplate,
  normalizeName,
  planSentence,
  planTaskList,
  readAs,
  rememberable,
  zonedDay,
  zonedInstant,
  type ColumnMapping,
  type ColumnOrder,
  type DateOrder,
  type ExistingLists,
  type ImportContext,
  type PlannedTask,
  type TaskListField,
} from '@/src/shared/import/taskList';
import type { FirestoreArea, FirestoreProject, FirestoreSection, FirestoreTask } from '@/src/shared/firestore/types';

export type ImportStep = 'upload' | 'columns' | 'check' | 'importing' | 'done';

/** For a blocked task whose time clashes: import it as free, without a time, or not at all. */
export type ConflictChoice = 'free' | 'unscheduled' | 'skip';

export interface ImportLog {
  id: string;
  at: Timestamp | null;
  created: { areas: string[]; folders?: string[]; projects: string[]; tasks: string[] };
  /** The projects tasks went into, for the links on the Done step. */
  projects?: { id: string; name: string; count: number }[];
  undoneAt: Timestamp | null;
  summary: string;
}

const BATCH = 450;
const UNDO_HOURS = 24;
const MAPPING_KEY = 'dreda.import.taskList.mapping';
const BLOCKED_TYPES = new Set(['Meeting', 'Event']);

function readRemembered(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const todayParts = (timeZone: string) => {
  const [y, m, d] = zonedDay(new Date(), timeZone).split('-').map(Number);
  return { y, m, d };
};

export function useTaskImport({ areaId = null, projectId = null }: { areaId?: string | null; projectId?: string | null } = {}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { prefs } = usePreferences();
  const timeZone = useTimeZone();
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? areasRef(uid) : null), [uid]));
  const { data: folderDocs } = useFirestoreCollection<FirestoreSection>(useMemo(() => (uid ? sectionsRef(uid) : null), [uid]));
  const { data: projectDocs } = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? projectsRef(uid) : null), [uid]));
  const { data: taskDocs } = useFirestoreCollection<FirestoreTask>(useMemo(() => (uid ? tasksRef(uid) : null), [uid]));

  // Where the import was opened: an area's page or a project's.
  const context: ImportContext | undefined = useMemo(() => {
    const project = projectId ? projectDocs.find((p) => p.id === projectId) : null;
    const area = areaDocs.find((a) => a.id === (project?.areaId ?? areaId));
    if (!area) return undefined;
    const folder = project?.bucketId ? folderDocs.find((f) => f.id === project.bucketId) : null;
    return {
      area: { id: area.id, name: area.name },
      folder: folder ? { id: folder.id, name: folder.name, isDefault: Boolean(folder.isDefault) } : null,
      project: project ? { id: project.id, name: project.name } : null,
    };
  }, [areaId, projectId, areaDocs, folderDocs, projectDocs]);

  const [step, setStepState] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [orderOverride, setOrderOverride] = useState<Record<string, DateOrder>>({});
  const [nameChoices, setNameChoices] = useState<Record<string, 'existing' | 'new'>>({});
  const [includeDuplicates, setIncludeDuplicates] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, Partial<Record<TaskListField, string>>>>({});
  const [conflictChoice, setConflictChoice] = useState<Record<number, ConflictChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<ImportLog | null>(null);
  const [undoing, setUndoing] = useState(false);

  /** Steps replace one another in the address, so Back leaves the import. */
  function setStep(next: ImportStep) {
    setStepState(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('step', next);
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // The step just isn't in the address.
    }
  }

  // ---- Upload ----

  function take(sheetHeaders: string[], sheetRows: Record<string, unknown>[], name: string) {
    if (sheetRows.length === 0) return setError('That file has no rows to import.');
    if (sheetRows.length > MAX_ROWS) return setError(`That file has ${sheetRows.length.toLocaleString('en-US')} rows; up to ${MAX_ROWS.toLocaleString('en-US')} can be imported at once.`);
    setError(null);
    setFileName(name);
    setHeaders(sheetHeaders);
    setRows(sheetRows);
    setMapping(mapColumns(sheetHeaders, readRemembered()));
    setOrderOverride({});
    setNameChoices({});
    setIncludeDuplicates(new Set());
    setEdits({});
    setConflictChoice({});
    setStep(matchesTemplate(sheetHeaders) ? 'check' : 'columns');
  }

  async function handleFile(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Raw values: an Excel date stays its serial number and a CSV cell its
      // text, so no Date (and no time zone) sits between the file and Dreda.
      const wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: true });
      const name = wb.SheetNames.find((n) => ['tasks', 'taches'].includes(normalizeName(n))) ?? wb.SheetNames[0];
      const sheet = wb.Sheets[name];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
      const head = (matrix[0] ?? []).map((h) => cellText(h));
      const named = head.map((h, i) => h || `Column ${i + 1}`);
      const body = matrix
        .slice(1)
        .filter((r) => r.some((c) => cellText(c) !== ''))
        .map((r) => Object.fromEntries(named.map((h, i) => [h, r[i] ?? ''])));
      take(named, body, file.name);
    } catch {
      setError('That file could not be read. Use .xlsx, .xls or .csv.');
    }
  }

  function setColumn(header: string, field: TaskListField | 'ignore') {
    setMapping((m) => {
      const next: ColumnMapping = { ...m };
      // A field belongs to one column.
      if (field !== 'ignore') for (const h of Object.keys(next)) if (next[h] === field) next[h] = 'ignore';
      next[header] = field;
      return next;
    });
  }

  function confirmColumns() {
    if (!Object.values(mapping).includes('task')) return setError('Choose the column that holds the task titles.');
    try {
      localStorage.setItem(MAPPING_KEY, JSON.stringify({ ...readRemembered(), ...rememberable(mapping) }));
    } catch {
      // Not remembered this time.
    }
    setError(null);
    setStep('check');
  }

  // ---- Check ----

  const dueColumn = Object.keys(mapping).find((h) => mapping[h] === 'due') ?? null;
  const fallback: DateOrder = prefs.dateFormat === 'mm/dd/yyyy' ? 'mdy' : 'dmy';
  const dueOrder: ColumnOrder | null = useMemo(
    () => (dueColumn ? detectOrder(rows.map((r) => r[dueColumn]), fallback) : null),
    [dueColumn, rows, fallback]
  );
  const orders: Record<string, DateOrder> = dueColumn && dueOrder ? { [dueColumn]: orderOverride[dueColumn] ?? dueOrder.order } : {};

  const existing: ExistingLists = useMemo(
    () => ({
      areas: areaDocs.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name })),
      folders: folderDocs.filter((f) => !f.archived).map((f) => ({ id: f.id, name: f.name, areaId: f.areaId, isDefault: Boolean(f.isDefault) })),
      projects: projectDocs.filter((p) => p.status !== 'Archived').map((p) => ({ id: p.id, name: p.name, areaId: p.areaId ?? null, bucketId: p.bucketId ?? null })),
      tasks: taskDocs
        .filter((t) => !t.archived)
        .map((t) => ({ projectId: t.projectId ?? null, title: t.title, due: t.dueDate ? zonedDay(t.dueDate.toDate(), timeZone) : null })),
    }),
    [areaDocs, folderDocs, projectDocs, taskDocs, timeZone]
  );

  const plan = useMemo(
    () =>
      step === 'upload' || step === 'columns'
        ? null
        : planTaskList(rows, existing, { mapping, orders, today: todayParts(timeZone), nameChoices, includeDuplicates, edits, context }),
    // orders is derived from orderOverride and dueOrder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, rows, existing, mapping, orderOverride, dueOrder, nameChoices, includeDuplicates, edits, context, timeZone]
  );

  const typeFor = () => 'ToDo';
  // Blocked tasks with a time that clashes with the calendar.
  const scheduled = useMemo(() => buildScheduledTasks(taskDocs, ''), [taskDocs]);
  const conflicts = useMemo(() => {
    const out = new Set<number>();
    for (const t of plan?.tasks ?? []) {
      if (!t.include || !t.due || t.start === null) continue;
      const mode = prefs.timeModeByType[typeFor()] ?? defaultTimeMode(typeFor());
      if (mode !== 'blocked' && !BLOCKED_TYPES.has(typeFor())) continue;
      const start = zonedInstant(t.due, t.start, timeZone);
      const end = zonedInstant(t.due, t.end ?? t.start + prefs.defaultTaskMinutes, timeZone);
      if (checkAvailability(start, end, 'blocked', null, scheduled).status === 'conflict') out.add(t.index);
    }
    return out;
  }, [plan, scheduled, prefs.timeModeByType, prefs.defaultTaskMinutes, timeZone]);

  /** Fix a cell in place: the row is read again. */
  function fix(index: number, field: TaskListField, text: string) {
    setEdits((e) => ({ ...e, [index]: { ...(e[index] ?? {}), [field]: text } }));
  }
  function answer(key: string, choice: 'existing' | 'new') {
    setNameChoices((c) => ({ ...c, [key]: choice }));
  }
  function toggleDuplicate(index: number, on: boolean) {
    setIncludeDuplicates((s) => {
      const next = new Set(s);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });
  }
  function chooseConflict(index: number, choice: ConflictChoice) {
    setConflictChoice((c) => ({ ...c, [index]: choice }));
  }
  const conflictsOpen = [...conflicts].filter((i) => !conflictChoice[i]).length;

  // ---- Import ----

  async function runImport() {
    if (!uid || !plan || !plan.ready || conflictsOpen > 0) return;
    setStep('importing');
    setError(null);
    const db = getFirebaseFirestore();
    const importId = crypto.randomUUID();
    const created: ImportLog['created'] = { areas: [], folders: [], projects: [], tasks: [] };
    const stamp = { importId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    const source = `Created by an import (${fileName ?? 'spreadsheet'})`;

    // Ids first, so every level can point at the one above it.
    const areaId = new Map<string, string>();
    const areaColor = new Map<string, string>();
    for (const a of plan.areas) {
      const id = a.existingId ?? crypto.randomUUID();
      areaId.set(a.key, id);
      areaColor.set(a.key, areaDocs.find((x) => x.id === id)?.color ?? PROJECT_COLORS[(created.areas.length + 1) % PROJECT_COLORS.length]);
      if (!a.existingId) created.areas.push(id);
    }
    const folderId = new Map<string, string>();
    for (const f of plan.folders) {
      const parent = areaId.get(f.parentKey!)!;
      const id = f.existingId ?? (f.isDefault ? defaultSectionId(parent) : crypto.randomUUID());
      folderId.set(f.key, id);
      if (!f.existingId && !f.isDefault) created.folders!.push(id);
    }
    const projectId = new Map<string, { id: string; areaId: string; bucketId: string }>();
    for (const p of plan.projects) {
      const folderKey = p.parentKey!;
      const bucketId = folderId.get(folderKey)!;
      const aId = areaId.get(plan.folders.find((f) => f.key === folderKey)!.parentKey!)!;
      const existingProject = p.existingId ? projectDocs.find((x) => x.id === p.existingId) : null;
      const id = p.existingId ?? crypto.randomUUID();
      // A task mirrors its project's own area and folder (FirestoreTask).
      projectId.set(p.key, { id, areaId: existingProject?.areaId ?? aId, bucketId: existingProject?.bucketId ?? bucketId });
      if (!p.existingId) created.projects.push(id);
    }

    try {
      // 1. Areas, then each one's General folder (ensureDefaultSection).
      const areaOps = plan.areas.filter((a) => !a.existingId).map((a) => (b: ReturnType<typeof writeBatch>) =>
        b.set(areaRef(uid, areaId.get(a.key)!), { name: a.name, emoji: null, color: areaColor.get(a.key)!, description: source, archived: false, ...stamp } as never)
      );
      await commit(areaOps);
      for (const a of plan.areas) await ensureDefaultSection(uid, areaId.get(a.key)!, areaColor.get(a.key)!);

      // 2. Folders, inside their area.
      await commit(
        plan.folders
          .filter((f) => !f.existingId && !f.isDefault)
          .map((f) => (b: ReturnType<typeof writeBatch>) =>
            b.set(sectionRef(uid, folderId.get(f.key)!), {
              name: f.name,
              emoji: null,
              color: areaColor.get(f.parentKey!)!,
              description: source,
              areaId: areaId.get(f.parentKey!)!,
              archived: false,
              isDefault: false,
              ...stamp,
            } as never)
          )
      );

      // 3. Projects, with their area and folder.
      await commit(
        plan.projects
          .filter((p) => !p.existingId)
          .map((p, i) => (b: ReturnType<typeof writeBatch>) => {
            const at = projectId.get(p.key)!;
            return b.set(projectRef(uid, at.id), {
              name: p.name,
              emoji: null,
              areaId: at.areaId,
              bucketId: at.bucketId,
              color: PROJECT_COLORS[i % PROJECT_COLORS.length],
              priority: 'Medium',
              startDate: null,
              endDate: null,
              originalEndDate: null,
              rescheduleCount: 0,
              status: 'Active',
              description: source,
              ...stamp,
            } as never);
          })
      );

      // 4. Tasks, through the task form's own document (newTaskDoc), with
      //    the area and folder mirrored from the project.
      const taskOps: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
      const perProject = new Map<string, number>();
      for (const t of plan.tasks) {
        if (!t.include) continue;
        const choice = conflictChoice[t.index];
        if (conflicts.has(t.index) && choice === 'skip') continue;
        const id = crypto.randomUUID();
        created.tasks.push(id);
        const where = t.projectKey ? projectId.get(t.projectKey)! : null;
        if (where) perProject.set(where.id, (perProject.get(where.id) ?? 0) + 1);
        taskOps.push((b) => b.set(taskRef(uid, id), taskDoc(t, where, choice, uid, importId) as never));
      }
      await commit(taskOps);

      const text = planSentence(plan).replace(/^This will add/, 'Added').replace(/ \d+ rows? needs? a look\.| \d+ duplicates? left out\./g, '');
      const projectsUsed = [...perProject].map(([id, count]) => ({
        id,
        count,
        name: projectDocs.find((p) => p.id === id)?.name ?? plan.projects.find((p) => projectId.get(p.key)?.id === id)?.name ?? 'Project',
      }));
      const entry: Omit<ImportLog, 'id'> = { at: Timestamp.now(), created, projects: projectsUsed, undoneAt: null, summary: text };
      await setDoc(doc(db, 'users', uid, 'settings', `import-${importId}`), { ...entry, fileName, report: reportRows(plan.tasks) } as never);
      setLog({ id: importId, ...entry });
      void runCalendarSync({ reason: 'manual' }).catch(() => undefined);
      const now = new Date();
      await applyNotificationWrites(uid, [
        {
          op: 'create',
          id: `import_finished:${importId}`,
          data: {
            id: `import_finished:${importId}`,
            type: 'import_finished',
            module: 'system',
            severity: 'info',
            dedupeKey: `import_finished:${importId}`,
            groupKey: 'import_finished',
            title: `Import finished: ${created.tasks.length} ${created.tasks.length === 1 ? 'task' : 'tasks'} added`,
            body: text,
            items: [],
            primaryAction: { label: 'Open the report', route: `/settings/import?report=${importId}` },
            secondaryActions: [],
            expiresAt: new Date(now.getTime() + 7 * 86_400_000),
            createdAt: now,
            updatedAt: now,
            readAt: null,
            resolvedAt: null,
            snoozedUntil: null,
            archivedAt: null,
          } as never,
        },
      ]).catch(() => undefined);
      setStep('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import stopped part way. What was written so far can be undone.');
      setLog({ id: importId, at: Timestamp.now(), created, undoneAt: null, summary: 'Stopped part way' });
      setStep('done');
    }

    async function commit(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
      setProgress((p) => ({ done: p.done, total: p.total + ops.length }));
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH).forEach((op) => op(batch));
        await batch.commit();
        setProgress((p) => ({ ...p, done: p.done + Math.min(BATCH, ops.length - i) }));
      }
    }
  }

  /** One task's document: the task form's defaults, then what the row says. */
  function taskDoc(t: PlannedTask, where: { id: string; areaId: string; bucketId: string } | null, choice: ConflictChoice | undefined, uid: string, importId: string) {
    const timed = t.due !== null && t.start !== null && choice !== 'unscheduled';
    const mode = choice === 'free' ? 'free' : (prefs.timeModeByType[typeFor()] ?? defaultTimeMode(typeFor()));
    // Built from the date's parts in the household's time zone. Due only:
    // the all-day convention (the day's start to its last minute).
    const startAt = t.due ? zonedInstant(t.due, timed ? t.start! : 0, timeZone) : null;
    const endAt = t.due ? zonedInstant(t.due, timed ? (t.end ?? t.start! + prefs.defaultTaskMinutes) : 23 * 60 + 59, timeZone) : null;
    const base = newTaskDoc({
      title: t.title,
      emoji: null,
      type: typeFor(),
      priority: t.priority ?? 'Medium',
      projectId: where?.id ?? null,
      areaId: where?.areaId ?? null,
      bucketId: where?.bucketId ?? null,
      startTime: startAt ?? new Date(),
      dueDate: endAt ?? new Date(),
      allDay: !timed,
      quadrant: t.quadrant,
      timeMode: mode,
      notes: t.notes,
      createdBy: uid,
      rrule: t.rrule && startAt ? t.rrule : null,
    });
    const done = t.status === 'Done';
    const out: Record<string, unknown> = {
      ...base,
      status: t.status ?? 'Pending',
      done,
      completedAt: done ? Timestamp.now() : null,
      tags: t.tags,
      subtasks: t.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
      importId,
    };
    // An undated task (the Inbox, or no due date) has no time at all, and
    // nothing goes to the calendar.
    if (!startAt) {
      Object.assign(out, { startTime: null, dueDate: null, originalDueDate: null, originalStartTime: null });
      delete out.googleSync;
    }
    return out;
  }

  /** Undo (within 24 hours): deletes what the import created; areas and folders are archived. */
  async function undo() {
    if (!uid || !log || undoing) return;
    if (log.at && Date.now() - log.at.toMillis() > UNDO_HOURS * 3_600_000) return setError('Undo is only possible for 24 hours after an import.');
    setUndoing(true);
    const db = getFirebaseFirestore();
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
      ...log.created.tasks.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(taskRef(uid, id))),
      ...log.created.projects.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(projectRef(uid, id))),
      // Areas and folders are never deleted (archive in place).
      ...(log.created.folders ?? []).map((id) => (b: ReturnType<typeof writeBatch>) => b.update(sectionRef(uid, id), { archived: true, updatedAt: serverTimestamp() })),
      ...log.created.areas.map((id) => (b: ReturnType<typeof writeBatch>) => b.update(areaRef(uid, id), { archived: true, updatedAt: serverTimestamp() })),
    ];
    try {
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH).forEach((op) => op(batch));
        await batch.commit();
      }
      await setDoc(doc(db, 'users', uid, 'settings', `import-${log.id}`), { undoneAt: serverTimestamp() }, { merge: true });
      setLog({ ...log, undoneAt: Timestamp.now() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not undo the import.');
    } finally {
      setUndoing(false);
    }
  }

  /** The skipped and problem rows as a CSV file. */
  function downloadReport() {
    const all = plan ? reportRows(plan.tasks) : [];
    const rowsOut = all.filter((r) => r.result !== 'Imported');
    const csv = [['Row', 'Task', 'Result', 'Why'], ...rowsOut.map((r) => [String(r.row), r.task, r.result, r.why])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dreda-import-report-${zonedDay(new Date(), timeZone)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Opens a past import's log (from the notification's "Open the report"). */
  async function openLog(importId: string) {
    if (!uid) return;
    const snap = await getDoc(doc(getFirebaseFirestore(), 'users', uid, 'settings', `import-${importId}`));
    if (!snap.exists()) return;
    setLog({ id: importId, ...(snap.data() as Omit<ImportLog, 'id'>) });
    setStep('done');
  }

  function reset() {
    setRows([]);
    setHeaders([]);
    setFileName(null);
    setLog(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setStep('upload');
  }

  return {
    step,
    setStep,
    fileName,
    error,
    context,
    timeZone,
    // upload
    handleFile,
    downloadTemplate: (format: 'xlsx' | 'csv') => downloadTaskListTemplate(existing, format),
    // columns
    headers,
    rows,
    mapping,
    setColumn,
    confirmColumns,
    // check
    plan,
    sentence: plan ? planSentence(plan) : '',
    dueOrder,
    dueColumn,
    order: dueColumn ? orders[dueColumn] : null,
    setOrder: (o: DateOrder) => dueColumn && setOrderOverride({ [dueColumn]: o }),
    orderNote: dueOrder?.ambiguous && dueOrder.example && dueColumn ? readAs(dueOrder.example, orders[dueColumn]) : null,
    fix,
    answer,
    toggleDuplicate,
    conflicts,
    conflictChoice,
    chooseConflict,
    conflictsOpen,
    // import
    runImport,
    progress,
    log,
    undo,
    undoing,
    canUndo: Boolean(log && !log.undoneAt && log.created.tasks.length + log.created.projects.length + log.created.areas.length > 0),
    downloadReport,
    openLog,
    reset,
  };
}

function reportRows(tasks: PlannedTask[]) {
  return tasks.map((t) => ({
    row: t.rowNumber,
    task: t.title,
    result: t.include ? 'Imported' : t.problems.length ? 'Not imported' : 'Skipped',
    why: t.problems.length ? t.problems.join(' ') : t.duplicate === 'existing' ? 'Already in Dreda' : t.duplicate === 'file' ? 'Repeated in the file' : '',
  }));
}

export type TaskImport = ReturnType<typeof useTaskImport>;
