'use client';

// Importing a task list (owner, 23 Nov 2026; the flow from file to finished,
// 24 Nov 2026). One sheet, one task per row, each row saying its Area,
// Folder and Project. The decisions are pure (src/shared/import/taskList.ts
// for reading the file, importRunner.ts and importLog.ts for writing it);
// this hook reads the file and what already exists, holds the person's
// choices and ticks, checks blocked tasks' time against the calendar, and
// drives the runner with Firestore.
//
// Steps: upload > columns (skipped when the headers are the template's) >
// review (the table, ticks) > ready (every count) > importing (the live
// table, then stopped, finished or rolled back).

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areaRef, areasRef, projectsRef, sectionRef, sectionsRef, taskRef, tasksRef } from '@/src/shared/firestore/refs';
import { defaultSectionId } from '@/src/shared/firestore/sections';
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
import { buildImportPlan, CHUNK, rollbackImport, runImport, settleWriting, tally, type RollbackIO } from '@/src/shared/import/importRunner';
import { planFromLog, statusOp, type ImportPlan, type LogStatus, type PlanItem, type StoredLog, type StoredPage, type WriteOp } from '@/src/shared/import/importLog';
import type { FirestoreArea, FirestoreProject, FirestoreSection, FirestoreTask } from '@/src/shared/firestore/types';

export type ImportStep = 'upload' | 'columns' | 'review' | 'ready' | 'importing';

/** For a ticked blocked task whose time clashes: import it as free, or without a time. */
export type ConflictChoice = 'free' | 'unscheduled';

/** What a row of the review table is. */
export type RowCheck = 'ready' | 'look' | 'duplicate' | 'clash';

export type RunStatus = LogStatus | 'idle';

export interface RunView {
  status: RunStatus;
  items: PlanItem[];
  /** The items of the chunk being written or removed. */
  current: string[];
  /** Per committed chunk, how long it took (ms). */
  chunkMs: number[];
  startedAt: number | null;
  /** While removing: how many of how many. */
  removing: { done: number; total: number } | null;
  /** Places a roll back left because something else is in them. */
  kept: { kind: string; name: string }[];
  /** The new places' names, for "Created Admin folder". */
  places: Record<string, { kind: string; name: string }>;
}

const UNDO_HOURS = 24;
const MAPPING_KEY = 'dreda.import.taskList.mapping';
const BLOCKED_TYPES = new Set(['Meeting', 'Event']);
const OPEN_STATUSES: LogStatus[] = ['running', 'stopping', 'rolling_back'];
const IDLE: RunView = { status: 'idle', items: [], current: [], chunkMs: [], startedAt: null, removing: null, kept: [], places: {} };
const placeNames = (p: ImportPlan) => Object.fromEntries(Object.values(p.places).map((x) => [x.id, { kind: x.kind, name: x.name }]));

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

  // Where the import was opened: an area's page or a project's. A project
  // with no folder of its own sits in its area's default folder.
  const context: ImportContext | undefined = useMemo(() => {
    const project = projectId ? projectDocs.find((p) => p.id === projectId) : null;
    const area = areaDocs.find((a) => a.id === (project?.areaId ?? areaId));
    if (!area) return undefined;
    const folder = project ? folderDocs.find((f) => f.id === (project.bucketId ?? defaultSectionId(area.id))) : null;
    return {
      area: { id: area.id, name: area.name },
      folder: folder ? { id: folder.id, name: folder.name, isDefault: Boolean(folder.isDefault) } : null,
      project: project && folder ? { id: project.id, name: project.name } : null,
    };
  }, [areaId, projectId, areaDocs, folderDocs, projectDocs]);

  const [step, setStepState] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [orderOverride, setOrderOverride] = useState<Record<string, DateOrder>>({});
  const [nameChoices, setNameChoices] = useState<Record<string, 'existing' | 'new'>>({});
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, Partial<Record<TaskListField, string>>>>({});
  const [conflictChoice, setConflictChoice] = useState<Record<number, ConflictChoice>>({});
  const [error, setError] = useState<string | null>(null);

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
    setTicked({});
    setEdits({});
    setConflictChoice({});
    setStep(matchesTemplate(sheetHeaders) ? 'review' : 'columns');
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
    setStep('review');
  }

  // ---- Review and select ----

  const dueColumn = Object.keys(mapping).find((h) => mapping[h] === 'due') ?? null;
  const fallback: DateOrder = prefs.dateFormat === 'mm/dd/yyyy' ? 'mdy' : 'dmy';
  const dueOrder: ColumnOrder | null = useMemo(() => (dueColumn ? detectOrder(rows.map((r) => r[dueColumn]), fallback) : null), [dueColumn, rows, fallback]);
  const orders: Record<string, DateOrder> = useMemo(
    () => (dueColumn && dueOrder ? { [dueColumn]: orderOverride[dueColumn] ?? dueOrder.order } : {}),
    [dueColumn, dueOrder, orderOverride]
  );

  const existing: ExistingLists = useMemo(
    () => ({
      areas: areaDocs.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name })),
      folders: folderDocs.filter((f) => !f.archived).map((f) => ({ id: f.id, name: f.name, areaId: f.areaId, isDefault: Boolean(f.isDefault) })),
      projects: projectDocs.filter((p) => p.status !== 'Archived').map((p) => ({ id: p.id, name: p.name, areaId: p.areaId ?? null, bucketId: p.bucketId ?? null })),
      tasks: taskDocs.filter((t) => !t.archived).map((t) => ({ projectId: t.projectId ?? null, title: t.title, due: t.dueDate ? zonedDay(t.dueDate.toDate(), timeZone) : null })),
    }),
    [areaDocs, folderDocs, projectDocs, taskDocs, timeZone]
  );

  const typeFor = () => 'ToDo';
  const scheduled = useMemo(() => buildScheduledTasks(taskDocs, ''), [taskDocs]);
  const planning = step === 'review' || step === 'ready';

  // First pass: what every row is. Then the clashes (they start unticked),
  // then the plan with them.
  const firstPass = useMemo(
    () => (planning ? planTaskList(rows, existing, { mapping, orders, today: todayParts(timeZone), nameChoices, ticked, edits, context }) : null),
    [planning, rows, existing, mapping, orders, nameChoices, ticked, edits, context, timeZone]
  );
  const conflicts = useMemo(() => {
    const out = new Set<number>();
    for (const t of firstPass?.tasks ?? []) {
      if (t.problems.length || !t.due || t.start === null) continue;
      const mode = prefs.timeModeByType[typeFor()] ?? defaultTimeMode(typeFor());
      if (mode !== 'blocked' && !BLOCKED_TYPES.has(typeFor())) continue;
      const start = zonedInstant(t.due, t.start, timeZone);
      const end = zonedInstant(t.due, t.end ?? t.start + prefs.defaultTaskMinutes, timeZone);
      if (checkAvailability(start, end, 'blocked', null, scheduled).status === 'conflict') out.add(t.index);
    }
    return out;
  }, [firstPass, scheduled, prefs.timeModeByType, prefs.defaultTaskMinutes, timeZone]);
  const plan = useMemo(
    () => (planning && firstPass ? (conflicts.size ? planTaskList(rows, existing, { mapping, orders, today: todayParts(timeZone), nameChoices, ticked, edits, context, untickedByDefault: conflicts }) : firstPass) : null),
    [planning, firstPass, conflicts, rows, existing, mapping, orders, nameChoices, ticked, edits, context, timeZone]
  );

  const checkOf = (t: PlannedTask): RowCheck => (t.problems.length ? 'look' : conflicts.has(t.index) ? 'clash' : t.duplicate ? 'duplicate' : 'ready');
  /** Ticked clashes still waiting for "free" or "without a time". */
  const clashesOpen = (plan?.tasks ?? []).filter((t) => t.include && conflicts.has(t.index) && !conflictChoice[t.index]).length;

  /** A cell's text as it stands: the fix typed in, else the file's. */
  function textOf(index: number, field: TaskListField): string {
    const edited = edits[index]?.[field];
    if (edited !== undefined) return edited;
    const col = Object.keys(mapping).find((h) => mapping[h] === field);
    return col ? cellText(rows[index]?.[col]) : '';
  }

  function fix(index: number, field: TaskListField, text: string) {
    setEdits((e) => ({ ...e, [index]: { ...(e[index] ?? {}), [field]: text } }));
  }
  /** "Put in…": Area, Folder and Project for several rows at once. */
  function putIn(indices: number[], where: { area: string; folder: string; project: string }) {
    setEdits((e) => {
      const next = { ...e };
      for (const i of indices) next[i] = { ...(next[i] ?? {}), area: where.area, folder: where.folder, project: where.project };
      return next;
    });
  }
  function answer(key: string, choice: 'existing' | 'new') {
    setNameChoices((c) => ({ ...c, [key]: choice }));
  }
  function tick(indices: number[], on: boolean) {
    setTicked((t) => {
      const next = { ...t };
      for (const i of indices) next[i] = on;
      return next;
    });
  }
  function chooseConflict(index: number, choice: ConflictChoice | 'skip') {
    if (choice === 'skip') return tick([index], false);
    setConflictChoice((c) => ({ ...c, [index]: choice }));
  }

  // ---- Ready to import: the runner's plan, every count known ----

  const nextId = () => doc(collection(getFirebaseFirestore(), 'users', uid ?? 'x', 'tasks')).id;
  const runPlanDraft: ImportPlan | null = useMemo(() => {
    if (step !== 'ready' || !uid || !plan) return null;
    const newAreaColor = new Map<string, string>();
    const areaColor = (id: string) => newAreaColor.get(id) ?? areaDocs.find((a) => a.id === id)?.color ?? PROJECT_COLORS[0];
    const source = `Created by an import (${fileName ?? 'spreadsheet'})`;
    const importId = nextId();
    return buildImportPlan({
      uid,
      importId,
      fileName: fileName ?? 'spreadsheet',
      tasks: plan.tasks.filter((t) => t.include),
      nodes: { areas: plan.areas, folders: plan.folders, projects: plan.projects },
      existingProjects: Object.fromEntries(projectDocs.map((p) => [p.id, { areaId: p.areaId ?? null, bucketId: p.bucketId ?? null }])),
      newId: nextId,
      defaultFolderId: defaultSectionId,
      docs: {
        area: ({ id, name, colorIndex }) => {
          const color = PROJECT_COLORS[colorIndex % PROJECT_COLORS.length];
          newAreaColor.set(id, color);
          return { name, emoji: null, color, description: source, archived: false, importId };
        },
        // As ensureDefaultSection writes it, with the import's id.
        defaultFolder: ({ areaId: a }) => ({ name: 'General', emoji: null, color: areaColor(a), description: 'Projects not sorted into a specific folder.', areaId: a, archived: false, isDefault: true, importId }),
        folder: ({ name, areaId: a }) => ({ name, emoji: null, color: areaColor(a), description: source, areaId: a, archived: false, isDefault: false, importId }),
        project: ({ name, areaId: a, folderId, colorIndex }) => ({
          name,
          emoji: null,
          areaId: a,
          bucketId: folderId,
          color: PROJECT_COLORS[colorIndex % PROJECT_COLORS.length],
          priority: 'Medium',
          startDate: null,
          endDate: null,
          originalEndDate: null,
          rescheduleCount: 0,
          status: 'Active',
          description: source,
          importId,
        }),
        task: (t, where) => taskDoc(t, where, conflictChoice[t.index], uid, importId),
      },
    });
    // nextId and taskDoc read uid, prefs and timeZone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, uid, plan, fileName, areaDocs, projectDocs, conflictChoice, prefs, timeZone]);

  /** Rows left out, and why. */
  const leftOutLive = useMemo(() => {
    const t = plan?.tasks ?? [];
    return {
      total: t.filter((x) => !x.include).length,
      unticked: t.filter((x) => !x.include && !x.problems.length && !x.duplicate && !conflicts.has(x.index)).length,
      duplicates: t.filter((x) => !x.include && !x.problems.length && x.duplicate).length,
      clashes: t.filter((x) => !x.include && !x.problems.length && !x.duplicate && conflicts.has(x.index)).length,
      look: t.filter((x) => x.problems.length).length,
    };
  }, [plan, conflicts]);

  // ---- Importing ----

  const [run, setRun] = useState<RunView>(IDLE);
  const runPlan = useRef<ImportPlan | null>(null);
  const stopRef = useRef(false);
  const [recovered, setRecovered] = useState<{ plan: ImportPlan; status: LogStatus } | null>(null);

  const busy = run.status === 'running' || run.status === 'stopping' || run.status === 'rolling_back';

  function io(p: ImportPlan): RollbackIO {
    const db = getFirebaseFirestore();
    const ref = (path: string) => doc(db, path);
    const isLog = (path: string) => path.includes('/settings/');
    const tasks = tasksRef(p.uid);
    return {
      now: () => serverTimestamp(),
      async commit(ops: WriteOp[]) {
        const batch = writeBatch(db);
        for (const op of ops) {
          if (op.type === 'delete') batch.delete(ref(op.path));
          // Documents get the server's time when written; the log keeps plain data.
          else if (op.type === 'set') batch.set(ref(op.path), isLog(op.path) ? op.data : { ...op.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          else batch.update(ref(op.path), op.data);
        }
        await batch.commit();
      },
      async tasksWithImportId() {
        const snap = await getDocs(query(tasks, where('importId', '==', p.importId)));
        return new Set(snap.docs.map((d) => d.id));
      },
      async isEmpty(place) {
        const none = async (field: string, coll: 'tasks' | 'projects' | 'buckets', except?: string | null) => {
          const snap = await getDocs(query(collection(db, 'users', p.uid, coll), where(field, '==', place.id), limit(2)));
          return snap.docs.every((d) => d.id === except);
        };
        if (place.kind === 'project') return none('projectId', 'tasks');
        if (place.kind === 'folder') return (await none('bucketId', 'projects')) && (await none('bucketId', 'tasks'));
        return (await none('areaId', 'projects')) && (await none('areaId', 'buckets', place.defaultFolderId)) && (await none('areaId', 'tasks'));
      },
      async removePlace(place) {
        const targets = place.kind === 'area' ? [sectionRef(p.uid, place.defaultFolderId ?? defaultSectionId(place.id)), areaRef(p.uid, place.id)] : [ref(`users/${p.uid}/${place.kind === 'folder' ? 'buckets' : 'projects'}/${place.id}`)];
        for (const target of targets) {
          try {
            await deleteDoc(target);
          } catch {
            // Areas and folders are archived in place where deleting isn't allowed.
            await updateDoc(target, place.kind === 'project' ? { status: 'Archived', updatedAt: serverTimestamp() } : { archived: true, updatedAt: serverTimestamp() }).catch(() => undefined);
          }
        }
      },
    };
  }

  const view = (p: ImportPlan, status: RunStatus, extra: Partial<RunView> = {}) =>
    setRun((r) => ({ ...r, status, items: p.items.map((i) => ({ ...i })), ...extra }));

  async function drive(p: ImportPlan, options: { fresh?: boolean; only?: string[] }) {
    stopRef.current = false;
    runPlan.current = p;
    setRun((r) => ({ ...IDLE, status: 'running', items: p.items.map((i) => ({ ...i })), startedAt: r.startedAt ?? Date.now(), places: placeNames(p) }));
    setStep('importing');
    try {
      const end = await runImport(p, io(p), {
        shouldStop: () => stopRef.current,
        onChunkStart: (s) => setRun((r) => ({ ...r, items: s.items, current: s.current })),
        onChunk: (s, ms) => setRun((r) => ({ ...r, items: s.items, current: [], chunkMs: [...r.chunkMs, ms] })),
      }, options);
      view(p, end, { current: [] });
      if (end === 'completed') void finished(p);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import could not start.');
      view(p, 'failed', { current: [] });
    }
  }

  // What was left out, as it stood at Start: once tasks land they would
  // read as duplicates of themselves.
  const [atStart, setAtStart] = useState<{ leftOut: typeof leftOutLive; report: string[][] } | null>(null);
  const leftOut = step === 'importing' && atStart ? atStart.leftOut : leftOutLive;

  function leftOutRows(): string[][] {
    const out: string[][] = [];
    for (const t of plan?.tasks ?? []) {
      if (t.include) continue;
      out.push([String(t.rowNumber), t.title, t.problems.length ? 'Needs a look' : 'Not ticked', t.problems.length ? t.problems.join(' ') : t.duplicate === 'existing' ? 'Already in Dreda' : t.duplicate === 'file' ? 'Repeated in the file' : conflicts.has(t.index) ? 'Time clash' : '']);
    }
    return out;
  }

  async function start() {
    if (!runPlanDraft || clashesOpen > 0 || !plan?.ready) return;
    setAtStart({ leftOut: leftOutLive, report: leftOutRows() });
    await drive(runPlanDraft, { fresh: true });
  }

  async function stop() {
    const p = runPlan.current;
    if (!p || run.status !== 'running') return;
    stopRef.current = true;
    setRun((r) => ({ ...r, status: 'stopping' }));
    await io(p).commit([statusOp(p, 'stopping')]).catch(() => undefined);
  }

  async function retryFailed() {
    const p = runPlan.current;
    if (!p) return;
    await drive(p, { only: p.items.filter((i) => i.status === 'failed').map((i) => i.id) });
  }

  async function rollback() {
    const p = runPlan.current;
    if (!p || busy) return;
    setRun((r) => ({ ...r, status: 'rolling_back', removing: { done: 0, total: tally(p.items).imported } }));
    try {
      const out = await rollbackImport(p, io(p), {
        onChunkStart: (s) => setRun((r) => ({ ...r, items: s.items, current: s.current, removing: { done: s.removed, total: s.total } })),
        onChunk: (s) => setRun((r) => ({ ...r, items: s.items, current: [], removing: { done: s.removed, total: s.total } })),
      });
      view(p, out.status, { current: [], kept: out.kept, removing: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove the import.');
      view(p, 'stopped', { current: [], removing: null });
    }
  }

  /** Undo, from Finished (within 24 hours). */
  async function undo() {
    const startedAt = run.startedAt;
    if (startedAt && Date.now() - startedAt > UNDO_HOURS * 3_600_000) return setError('Undo is only possible for 24 hours after an import.');
    await rollback();
  }

  /** Stopped: keep what is in. The log stays "stopped"; the finished view shows. */
  function keep() {
    setRun((r) => ({ ...r, status: 'completed' }));
  }

  async function finished(p: ImportPlan) {
    void runCalendarSync({ reason: 'manual' }).catch(() => undefined);
    const n = tally(p.items).imported;
    const now = new Date();
    await applyNotificationWrites(p.uid, [
      {
        op: 'create',
        id: `import_finished:${p.importId}`,
        data: {
          id: `import_finished:${p.importId}`,
          type: 'import_finished',
          module: 'system',
          severity: 'info',
          dedupeKey: `import_finished:${p.importId}`,
          groupKey: 'import_finished',
          title: `Import finished: ${n} ${n === 1 ? 'task' : 'tasks'} added`,
          body: `From ${p.fileName}.`,
          items: [],
          primaryAction: { label: 'Open the report', route: `/settings/import?report=${p.importId}` },
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
  }

  // Closing the tab mid-run warns first (the runner stops between chunks
  // only; what is in stays, and the log says so for next time).
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // A link clicked mid-run stops the import instead of leaving it.
    const guard = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!a || run.status !== 'running') return;
      e.preventDefault();
      e.stopPropagation();
      void stop();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guard, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guard, true);
    };
    // stop reads the current run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, run.status]);

  // ---- Reading a log back: after a crash, or the notification's report ----

  async function loadLog(importId: string): Promise<{ plan: ImportPlan; status: LogStatus } | null> {
    if (!uid) return null;
    const db = getFirebaseFirestore();
    const snap = await getDoc(doc(db, 'users', uid, 'settings', `import-${importId}`));
    if (!snap.exists()) return null;
    const log = snap.data() as StoredLog;
    const pages: StoredPage[] = [];
    for (let n = 0; n < (log.pages ?? 0); n++) {
      const page = await getDoc(doc(db, 'users', uid, 'settings', `import-${importId}-items-${n}`));
      if (page.exists()) pages.push(page.data() as StoredPage);
    }
    const p = planFromLog(uid, importId, log, pages);
    const status: LogStatus = log.status ?? (log.undoneAt ? 'rolled_back' : 'completed');
    return { plan: p, status };
  }

  // An import left part way (closed tab, crash): offered when the import opens.
  const looked = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || looked.current === uid) return;
    looked.current = uid;
    void (async () => {
      try {
        const db = getFirebaseFirestore();
        const snap = await getDocs(query(collection(db, 'users', uid, 'settings'), where('kind', '==', 'taskImport'), where('status', 'in', OPEN_STATUSES)));
        const latest = snap.docs.sort((a, b) => String(b.data().importId).localeCompare(String(a.data().importId)))[0];
        if (!latest) return;
        const found = await loadLog(String(latest.data().importId));
        if (!found) return;
        await settleWriting(found.plan, async (id) => (await getDoc(taskRef(uid, id))).exists());
        setRecovered(found);
      } catch {
        // Nothing to offer.
      }
    })();
    // loadLog reads uid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  function takeRecovered() {
    if (!recovered) return null;
    runPlan.current = recovered.plan;
    setFileName(recovered.plan.fileName);
    setRecovered(null);
    return recovered.plan;
  }
  async function resume() {
    const p = takeRecovered();
    if (p) await drive(p, {});
  }
  async function removeRecovered() {
    const p = takeRecovered();
    if (!p) return;
    setRun({ ...IDLE, status: 'stopped', items: p.items.map((i) => ({ ...i })), places: placeNames(p) });
    setStep('importing');
    await rollback();
  }
  async function keepRecovered() {
    const p = takeRecovered();
    if (!p) return;
    await io(p).commit([statusOp(p, 'stopped')]).catch(() => undefined);
  }

  /** Opens a past import (from the notification's "Open the report"). */
  async function openLog(importId: string) {
    const found = await loadLog(importId);
    if (!found) return;
    runPlan.current = found.plan;
    setFileName(found.plan.fileName);
    setRun({ ...IDLE, status: found.status === 'stopped' ? 'completed' : found.status, items: found.plan.items, places: placeNames(found.plan) });
    setStep('importing');
  }

  // ---- The report ----

  /** Rows that did not go in, as a CSV file. */
  function downloadReport() {
    const out: string[][] = [['Row', 'Task', 'Result', 'Why'], ...(atStart?.report ?? leftOutRows())];
    for (const i of run.items) if (i.status === 'failed') out.push([String(i.sourceRow), i.label, 'Failed', i.error ?? '']);
    const csv = out.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dreda-import-report-${zonedDay(new Date(), timeZone)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** One task's document: the task form's defaults (newTaskDoc), then what the row says. */
  function taskDoc(t: PlannedTask, where: { projectId: string; areaId: string; bucketId: string }, choice: ConflictChoice | undefined, uid: string, importId: string) {
    const timed = t.due !== null && t.start !== null && choice !== 'unscheduled';
    const mode = choice === 'free' ? 'free' : (prefs.timeModeByType[typeFor()] ?? defaultTimeMode(typeFor()));
    // Built from the date's parts in the household's time zone. Due only:
    // the all-day convention (the day's start to its last minute).
    const startAt = t.due ? zonedInstant(t.due, timed ? t.start! : 0, timeZone) : null;
    const endAt = t.due ? zonedInstant(t.due, timed ? (t.end ?? t.start! + prefs.defaultTaskMinutes) : 23 * 60 + 59, timeZone) : null;
    const base: Record<string, unknown> = newTaskDoc({
      title: t.title,
      emoji: null,
      type: typeFor(),
      priority: t.priority ?? 'Medium',
      projectId: where.projectId,
      areaId: where.areaId,
      bucketId: where.bucketId,
      startTime: startAt ?? new Date(),
      dueDate: endAt ?? new Date(),
      allDay: !timed,
      quadrant: t.quadrant,
      timeMode: mode,
      notes: t.notes,
      createdBy: uid,
      rrule: t.rrule && startAt ? t.rrule : null,
    });
    // The write stamps createdAt and updatedAt; the log keeps plain data.
    delete base.createdAt;
    delete base.updatedAt;
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
    // An undated task has no time at all, and nothing goes to the calendar.
    if (!startAt) {
      Object.assign(out, { startTime: null, dueDate: null, originalDueDate: null, originalStartTime: null });
      delete out.googleSync;
    }
    return out;
  }

  function reset() {
    setRows([]);
    setHeaders([]);
    setFileName(null);
    setError(null);
    setRun(IDLE);
    setAtStart(null);
    runPlan.current = null;
    setStep('upload');
  }

  /** The projects the imported tasks went into, for the links on Finished. */
  const projectsUsed = useMemo(() => {
    const by = new Map<string, { id: string; name: string; count: number }>();
    for (const i of run.items) {
      if (i.status !== 'imported' || !i.projectId) continue;
      const cur = by.get(i.projectId) ?? { id: i.projectId, name: i.where.split(' / ').pop() || 'Project', count: 0 };
      cur.count++;
      by.set(i.projectId, cur);
    }
    return [...by.values()];
  }, [run.items]);

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
    // review
    plan,
    existing,
    sentence: plan ? planSentence(plan) : '',
    dueOrder,
    dueColumn,
    order: dueColumn ? orders[dueColumn] : null,
    setOrder: (o: DateOrder) => dueColumn && setOrderOverride({ [dueColumn]: o }),
    orderNote: dueOrder?.ambiguous && dueOrder.example && dueColumn ? readAs(dueOrder.example, orders[dueColumn]) : null,
    checkOf,
    textOf,
    fix,
    putIn,
    answer,
    tick,
    conflicts,
    conflictChoice,
    chooseConflict,
    clashesOpen,
    // ready
    runPlan: runPlanDraft,
    leftOut,
    chunkSize: CHUNK,
    // importing
    run,
    busy,
    start,
    stop,
    keep,
    rollback,
    retryFailed,
    undo,
    canUndo: run.status === 'completed' && tally(run.items).imported > 0,
    projectsUsed,
    downloadReport,
    // a run left part way
    recovered: recovered ? { fileName: recovered.plan.fileName, ...tally(recovered.plan.items), total: recovered.plan.items.length, status: recovered.status } : null,
    resume,
    removeRecovered,
    keepRecovered,
    openLog,
    reset,
  };
}

export type TaskImport = ReturnType<typeof useTaskImport>;
