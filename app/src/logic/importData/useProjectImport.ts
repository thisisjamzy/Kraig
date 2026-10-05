'use client';

// Importing projects and tasks from a spreadsheet (Settings > Import and
// export, Projects' "Import from spreadsheet", a project's "Import tasks").
// The decisions are pure (src/shared/import/projectTasks.ts); this hook
// reads the file and what already exists, holds the person's choices,
// checks blocked tasks' time against the calendar, writes in batches tagged
// with an import id, keeps a log for Undo (24 hours) and the report, syncs
// Google Calendar once and leaves one notification.
//
// Steps: upload > match > review > confirm > importing > result.

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areaRef, areasRef, projectRef, projectsRef, taskRef, tasksRef } from '@/src/shared/firestore/refs';
import { applyNotificationWrites } from '@/src/shared/firestore/notificationWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { usePreferences } from '@/src/shared/firestore/preferences';
import { runCalendarSync } from '@/src/shared/calendarSync/runner';
import { checkAvailability, defaultTimeMode } from '@/src/viewmodels/scheduling';
import { buildScheduledTasks } from '@/src/logic/taskEdit/useLogic';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import {
  MAX_ROWS,
  autoMap,
  buildReview,
  cellText,
  normalizeName,
  rememberable,
  summarize,
  summaryText,
  type Decision,
  type Mapping,
  type ProjectField,
  type ReviewItem,
  type RowStatus,
  type TaskField,
} from '@/src/shared/import/projectTasks';
import type { FirestoreArea, FirestoreProject, FirestoreTask } from '@/src/shared/firestore/types';

export type ImportStep = 'upload' | 'match' | 'review' | 'confirm' | 'importing' | 'result';

interface Sheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

/** For a blocked task whose time clashes: import it as free, without a time, or not at all. */
export type ConflictChoice = 'free' | 'unscheduled' | 'skip';

export interface ImportLog {
  id: string;
  at: Timestamp | null;
  created: { areas: string[]; projects: string[]; tasks: string[] };
  updated: { collection: 'projects' | 'tasks'; id: string; before: Record<string, unknown> }[];
  undoneAt: Timestamp | null;
  summary: string;
}

const BATCH = 450;
const UNDO_HOURS = 24;
const MAPPING_KEY = 'dreda.import.mapping';
const BLOCKED_TYPES = new Set(['Meeting', 'Event']);

function readRemembered(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function sheetFrom(name: string, rows: Record<string, unknown>[]): Sheet {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { name, headers, rows };
}

/** Which sheet holds projects and which tasks, by name, then by its columns. */
function roles(sheets: Sheet[]): { projects: string | null; tasks: string | null } {
  const byName = (re: RegExp) => sheets.find((s) => re.test(s.name.trim().toLowerCase()))?.name ?? null;
  let projects = byName(/^projects?$/);
  let tasks = byName(/^tasks?$/);
  if (!tasks) {
    const withProjectColumn = sheets.find((s) => s.headers.some((h) => /^project/i.test(h.trim())) && s.name !== projects);
    tasks = withProjectColumn?.name ?? (sheets.length === 1 ? sheets[0].name : null);
  }
  if (projects === tasks) projects = null;
  return { projects, tasks };
}

const dateAt = (iso: string, minutes: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
};

export function useProjectImport({ projectId = null }: { projectId?: string | null } = {}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { prefs } = usePreferences();
  const { data: projectDocs } = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? projectsRef(uid) : null), [uid]));
  const { data: taskDocs } = useFirestoreCollection<FirestoreTask>(useMemo(() => (uid ? tasksRef(uid) : null), [uid]));
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? areasRef(uid) : null), [uid]));
  const contextProject = projectId ? (projectDocs.find((p) => p.id === projectId) ?? null) : null;

  const [step, setStepState] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [projectSheet, setProjectSheet] = useState<string | null>(null);
  const [taskSheet, setTaskSheet] = useState<string | null>(null);
  const [projectMap, setProjectMap] = useState<Mapping<ProjectField>>({});
  const [taskMap, setTaskMap] = useState<Mapping<TaskField>>({});
  const [dayFirst, setDayFirst] = useState(prefs.dateFormat !== 'mm/dd/yyyy');
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { decision: Decision; decided: boolean }>>({});
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [areaChoice, setAreaChoice] = useState<Record<string, string>>({}); // area name -> existing id, or '' to create
  const [conflictChoice, setConflictChoice] = useState<Record<string, ConflictChoice>>({});
  const [filter, setFilter] = useState<RowStatus | 'all'>('all');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<ImportLog | null>(null);
  const [undoing, setUndoing] = useState(false);

  /** Steps replace one another in the URL, so Back leaves the import. */
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

  function take(found: Sheet[], name: string) {
    const total = found.reduce((s, x) => s + x.rows.length, 0);
    if (!found.length || total === 0) return setError('That file has no rows to import.');
    if (total > MAX_ROWS) return setError(`That file has ${total.toLocaleString('en-US')} rows; up to ${MAX_ROWS.toLocaleString('en-US')} can be imported at once.`);
    setError(null);
    setFileName(name);
    setSheets(found);
    const r = roles(found);
    const projectsRole = projectId ? null : r.projects;
    setProjectSheet(projectsRole);
    setTaskSheet(r.tasks);
    const remembered = readRemembered();
    const ps = found.find((s) => s.name === projectsRole);
    const ts = found.find((s) => s.name === r.tasks);
    setProjectMap(ps ? autoMap<ProjectField>(ps.headers, 'projects', remembered) : {});
    setTaskMap(ts ? autoMap<TaskField>(ts.headers, 'tasks', remembered) : {});
    setOverrides({});
    setEdits({});
    setStep('match');
  }

  async function handleFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      take(
        wb.SheetNames.map((n) => sheetFrom(n, XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n], { defval: '' }))).filter((s) => s.rows.length),
        file.name
      );
    } catch {
      setError('That file could not be read. Use .xlsx, .xls or .csv.');
    }
  }

  /** Rows copied from a spreadsheet (tab separated, the first line the headers). */
  function handlePaste(text: string) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (lines.length < 2) return setError('Paste the header row and at least one row.');
    const headers = lines[0].split('\t').map((h) => h.trim());
    const rows = lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [headers[i] ?? `Column ${i + 1}`, v.trim()])));
    take([sheetFrom('Pasted rows', rows)], 'Pasted rows');
  }

  /** A template to fill in: tasks for one project, projects and tasks in one sheet, or two sheets. */
  function downloadTemplate(kind: 'tasks' | 'combined' | 'two-sheets') {
    const wb = XLSX.utils.book_new();
    const taskCols = ['Name', 'Description', 'Date', 'Start time', 'End time', 'Importance', 'Type', 'Time mode', 'Status', 'Repeats', 'Subtasks'];
    const taskRow = ['Book the venue', 'Two quotes first', '05/11/2026', '09:00', '10:00', 'Do first', 'ToDo', 'Free', 'Pending', '', 'Call A; Call B'];
    if (kind === 'tasks') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([taskCols, taskRow]), 'Tasks');
    if (kind === 'combined') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Project', ...taskCols], ['Wedding', ...taskRow]]), 'Tasks');
    if (kind === 'two-sheets') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ['Name', 'Area', 'Description', 'Start date', 'End date', 'Status', 'Tags', 'Color'],
          ['Wedding', 'Family', 'The big day', '01/10/2026', '20/12/2026', 'Active', 'family', ''],
        ]),
        'Projects'
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Project', ...taskCols], ['Wedding', ...taskRow]]), 'Tasks');
    }
    XLSX.writeFile(wb, `dreda-${kind}-template.xlsx`);
  }

  // ---- Match ----

  function confirmMapping() {
    try {
      const saved = { ...readRemembered(), ...rememberable(projectMap), ...rememberable(taskMap) };
      localStorage.setItem(MAPPING_KEY, JSON.stringify(saved));
    } catch {
      // Not remembered on this device.
    }
    if (!Object.values(taskMap).includes('name') && !Object.values(projectMap).includes('name')) {
      return setError('Match a column to Name first.');
    }
    setError(null);
    setStep('review');
  }

  // ---- Review ----

  const existing = useMemo(
    () => ({
      projects: projectDocs.map((p) => ({
        id: p.id,
        name: p.name,
        archived: p.status === 'Archived',
        description: p.description ?? '',
        startDate: p.startDate ? isoDay(p.startDate.toDate()) : null,
        endDate: p.endDate ? isoDay(p.endDate.toDate()) : null,
        areaName: areaDocs.find((a) => a.id === p.areaId)?.name ?? null,
      })),
      tasks: taskDocs
        .filter((t) => !t.archived)
        .map((t) => ({ id: t.id, projectId: t.projectId, title: t.title, date: t.dueDate ? isoDay(t.dueDate.toDate()) : null, notes: t.notes ?? '' })),
    }),
    [projectDocs, taskDocs, areaDocs]
  );

  const rawItems = useMemo(() => {
    if (step === 'upload' || step === 'match') return [];
    const ps = sheets.find((s) => s.name === projectSheet);
    const ts = sheets.find((s) => s.name === taskSheet);
    const patched = (sheet: Sheet, prefix: string) =>
      sheet.rows.map((row, i) => (edits[`${prefix}:${sheet.name}:${i + 2}`] ? { ...row, ...edits[`${prefix}:${sheet.name}:${i + 2}`] } : row));
    return buildReview({
      projectRows: ps ? { sheet: ps.name, rows: patched(ps, 'p'), mapping: projectMap } : null,
      taskRows: ts ? { sheet: ts.name, rows: patched(ts, 't'), mapping: taskMap } : null,
      existing,
      dayFirst,
      contextProject: contextProject ? { id: contextProject.id, name: contextProject.name } : null,
    });
  }, [step, sheets, projectSheet, taskSheet, projectMap, taskMap, existing, dayFirst, contextProject, edits]);

  // Blocked tasks with a time that clashes with the calendar.
  const scheduled = useMemo(() => buildScheduledTasks(taskDocs, ''), [taskDocs]);
  const conflicts = useMemo(() => {
    const out = new Set<string>();
    for (const item of rawItems) {
      const t = item.task;
      if (!t || item.status === 'problem' || !t.date || t.start === null) continue;
      const mode = t.timeMode ?? prefs.timeModeByType[t.type] ?? defaultTimeMode(t.type);
      if (mode !== 'blocked' && !BLOCKED_TYPES.has(t.type)) continue;
      const start = dateAt(t.date, t.start);
      const end = dateAt(t.date, t.end ?? t.start + prefs.defaultTaskMinutes);
      if (checkAvailability(start, end, 'blocked', null, scheduled).status === 'conflict') out.add(item.key);
    }
    return out;
  }, [rawItems, scheduled, prefs.timeModeByType, prefs.defaultTaskMinutes]);

  const items: (ReviewItem & { conflict: boolean })[] = useMemo(
    () =>
      rawItems.map((item) => {
        const o = overrides[item.key];
        const conflict = conflicts.has(item.key);
        return {
          ...item,
          ...(o ?? {}),
          decided: o ? o.decided : item.decided && !(conflict && !conflictChoice[item.key]),
          conflict,
        };
      }),
    [rawItems, overrides, conflicts, conflictChoice]
  );

  function decide(key: string, decision: Decision) {
    setOverrides((o) => ({ ...o, [key]: { decision, decided: true } }));
  }
  /** One choice for every row of a status (duplicates or possible duplicates). */
  function decideAll(status: RowStatus, decision: Decision) {
    setOverrides((o) => {
      const next = { ...o };
      for (const i of items) if (i.status === status && (decision !== 'update' || i.match)) next[i.key] = { decision, decided: true };
      return next;
    });
  }
  /** Fix a problem row: new values for its cells (by field), re-read on the spot. */
  function fix(item: ReviewItem, values: Partial<Record<'name' | 'date' | 'start' | 'end', string>>) {
    const map = item.kind === 'project' ? projectMap : taskMap;
    const column = (field: string) => Object.keys(map).find((h) => map[h] === field);
    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(values)) {
      const col = column(field);
      if (col) patch[col] = value;
    }
    setEdits((e) => ({ ...e, [item.key]: { ...(e[item.key] ?? {}), ...patch } }));
    setOverrides((o) => {
      const next = { ...o };
      delete next[item.key];
      return next;
    });
  }
  function chooseConflict(key: string, choice: ConflictChoice) {
    setConflictChoice((c) => ({ ...c, [key]: choice }));
    if (choice === 'skip') decide(key, 'skip');
  }

  // Areas the file names that don't exist yet: created, or mapped to one that does.
  const missingAreas = useMemo(() => {
    const known = new Set(areaDocs.map((a) => normalizeName(a.name)));
    const names = new Map<string, string>();
    for (const i of items) {
      const area = i.project?.area;
      if (i.kind === 'project' && i.decision === 'create' && area && !known.has(normalizeName(area))) names.set(normalizeName(area), area);
    }
    return [...names.values()];
  }, [items, areaDocs]);

  const summary = summarize(items);
  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter);

  // ---- Import ----

  async function runImport() {
    if (!uid || summary.needAttention > 0) return;
    setStep('importing');
    setError(null);
    const db = getFirebaseFirestore();
    const importId = crypto.randomUUID();
    const created: ImportLog['created'] = { areas: [], projects: [], tasks: [] };
    const updated: ImportLog['updated'] = [];
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

    // Areas
    const areaIdByName = new Map(areaDocs.map((a) => [normalizeName(a.name), a.id]));
    for (const name of missingAreas) {
      const mapped = areaChoice[name];
      if (mapped) {
        areaIdByName.set(normalizeName(name), mapped);
        continue;
      }
      const id = crypto.randomUUID();
      areaIdByName.set(normalizeName(name), id);
      created.areas.push(id);
      ops.push((b) =>
        b.set(areaRef(uid, id), { name, emoji: null, color: PROJECT_COLORS[0], description: `Created by an import (${fileName ?? 'spreadsheet'})`, archived: false, importId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
      );
    }

    // Projects
    const projectIdByKey = new Map(projectDocs.map((p) => [normalizeName(p.name), p.id]));
    if (contextProject) projectIdByKey.set(normalizeName(contextProject.name), contextProject.id);
    for (const item of items.filter((i) => i.kind === 'project')) {
      const p = item.project!;
      const areaId = p.area ? (areaIdByName.get(normalizeName(p.area)) ?? null) : null;
      const fields = {
        ...(p.description ? { description: p.description } : {}),
        ...(p.start ? { startDate: Timestamp.fromDate(new Date(`${p.start}T00:00:00`)) } : {}),
        ...(p.end ? { endDate: Timestamp.fromDate(new Date(`${p.end}T00:00:00`)) } : {}),
      };
      if (item.decision === 'create') {
        const id = crypto.randomUUID();
        projectIdByKey.set(item.projectKey, id);
        created.projects.push(id);
        const end = p.end ? Timestamp.fromDate(new Date(`${p.end}T00:00:00`)) : null;
        ops.push((b) =>
          b.set(projectRef(uid, id), {
            name: p.name,
            emoji: null,
            areaId,
            bucketId: null,
            color: PROJECT_COLORS.find((c) => c.toLowerCase() === p.color.toLowerCase()) ?? PROJECT_COLORS[created.projects.length % PROJECT_COLORS.length],
            priority: 'Medium',
            startDate: p.start ? Timestamp.fromDate(new Date(`${p.start}T00:00:00`)) : null,
            endDate: end,
            originalEndDate: end,
            rescheduleCount: 0,
            status: (p.status ?? 'Active') as FirestoreProject['status'],
            description: p.description || 'Imported from a spreadsheet.',
            importId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as never)
        );
      } else if (item.decision === 'update' && item.match && !item.match.sameFile) {
        const id = item.match.id;
        projectIdByKey.set(item.projectKey, id);
        const before = projectDocs.find((x) => x.id === id);
        updated.push({ collection: 'projects', id, before: pick(before as unknown as Record<string, unknown>, ['description', 'startDate', 'endDate', 'status']) });
        ops.push((b) => b.update(projectRef(uid, id), { ...fields, status: 'Active', updatedAt: serverTimestamp() }));
      } else if (item.match && !item.match.sameFile) projectIdByKey.set(item.projectKey, item.match.id);
    }

    // Tasks
    for (const item of items.filter((i) => i.kind === 'task')) {
      if (item.decision === 'skip') continue;
      const t = item.task!;
      const pid = projectIdByKey.get(item.projectKey) ?? null;
      const choice = conflictChoice[item.key];
      const timed = t.date !== null && t.start !== null && choice !== 'unscheduled';
      const allDay = !timed;
      const startAt = t.date ? (timed ? dateAt(t.date, t.start!) : dateAt(t.date, 0)) : null;
      const endAt = t.date ? (timed ? dateAt(t.date, t.end ?? t.start! + prefs.defaultTaskMinutes) : dateAt(t.date, 23 * 60 + 59)) : null;
      const mode = choice === 'free' ? 'free' : (t.timeMode ?? prefs.timeModeByType[t.type] ?? defaultTimeMode(t.type));
      const done = t.status === 'Done';
      if (item.decision === 'update' && item.match && !item.match.sameFile) {
        const id = item.match.id;
        const before = taskDocs.find((x) => x.id === id);
        updated.push({ collection: 'tasks', id, before: pick(before as unknown as Record<string, unknown>, ['notes', 'startTime', 'dueDate']) });
        ops.push((b) =>
          b.update(taskRef(uid, id), {
            ...(t.description ? { notes: t.description } : {}),
            ...(startAt && endAt ? { startTime: Timestamp.fromDate(startAt), dueDate: Timestamp.fromDate(endAt) } : {}),
            updatedAt: serverTimestamp(),
          })
        );
        continue;
      }
      const id = crypto.randomUUID();
      created.tasks.push(id);
      ops.push((b) =>
        b.set(taskRef(uid, id), {
          title: t.name,
          emoji: null,
          type: t.type,
          priority: t.quadrant === 'do' ? 'High' : t.quadrant === 'eliminate' ? 'Low' : 'Medium',
          projectId: pid,
          areaId: null,
          bucketId: null,
          parentTaskId: null,
          done,
          status: (t.status ?? 'Pending') as FirestoreTask['status'],
          startTime: startAt ? Timestamp.fromDate(startAt) : null,
          dueDate: endAt ? Timestamp.fromDate(endAt) : null,
          allDay,
          quadrant: t.quadrant,
          timeMode: mode,
          ...(t.rrule && startAt ? { rrule: t.rrule, exceptions: {} } : {}),
          originalDueDate: endAt ? Timestamp.fromDate(endAt) : null,
          originalStartTime: startAt ? Timestamp.fromDate(startAt) : null,
          rescheduleCount: 0,
          completedAt: done ? Timestamp.now() : null,
          calendarEventId: null,
          dependsOnTaskId: null,
          estimatedCost: null,
          linkedTransactionId: null,
          notes: t.description || 'Imported from a spreadsheet.',
          tags: [],
          subtasks: t.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
          archived: false,
          createdBy: uid,
          importId,
          ...(timed && mode === 'blocked' ? { googleSync: { state: 'pending' } } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as never)
      );
    }

    setProgress({ done: 0, total: ops.length });
    try {
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH).forEach((op) => op(batch));
        await batch.commit();
        setProgress({ done: Math.min(ops.length, i + BATCH), total: ops.length });
      }
      const text = summaryText(summary);
      const entry: Omit<ImportLog, 'id'> = { at: Timestamp.now(), created, updated, undoneAt: null, summary: text };
      await setDoc(doc(db, 'users', uid, 'settings', `import-${importId}`), { ...entry, fileName, report: reportRows(items) } as never);
      setLog({ id: importId, ...entry });
      // One sync for whatever the import put on the calendar, and one notification.
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
      setStep('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import stopped part way. What was written so far can be undone.');
      const partial: ImportLog = { id: importId, at: Timestamp.now(), created, updated, undoneAt: null, summary: 'Stopped part way' };
      setLog(partial);
      setStep('result');
    }
  }

  /** Undo (within 24 hours): removes what the import created, puts back what it changed. */
  async function undo() {
    if (!uid || !log || undoing) return;
    if (log.at && Date.now() - log.at.toMillis() > UNDO_HOURS * 3_600_000) return setError('Undo is only possible for 24 hours after an import.');
    setUndoing(true);
    const db = getFirebaseFirestore();
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
      ...log.created.tasks.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(taskRef(uid, id))),
      ...log.created.projects.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(projectRef(uid, id))),
      // Areas are never deleted (archive in place).
      ...log.created.areas.map((id) => (b: ReturnType<typeof writeBatch>) => b.update(areaRef(uid, id), { archived: true, updatedAt: serverTimestamp() })),
      ...log.updated.map((u) => (b: ReturnType<typeof writeBatch>) => (u.collection === 'projects' ? b.update(projectRef(uid, u.id), u.before) : b.update(taskRef(uid, u.id), u.before))),
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

  /** The import's report as a CSV file: each row, what happened and why. */
  function downloadReport() {
    const rows = reportRows(items);
    const csv = [['Sheet', 'Row', 'Kind', 'Name', 'Project', 'Status', 'Result', 'Problems'], ...rows.map((r) => [r.sheet, String(r.row), r.kind, r.name, r.project, r.status, r.result, r.problems])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dreda-import-report-${isoDay(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Opens a past import's log (from the notification's "Open the report"). */
  async function openLog(importId: string) {
    if (!uid) return;
    const snap = await getDoc(doc(getFirebaseFirestore(), 'users', uid, 'settings', `import-${importId}`));
    if (!snap.exists()) return;
    const data = snap.data() as Omit<ImportLog, 'id'>;
    setLog({ id: importId, ...data });
    setStep('result');
  }

  function reset() {
    setSheets([]);
    setFileName(null);
    setLog(null);
    setError(null);
    setStep('upload');
  }

  return {
    step,
    setStep,
    fileName,
    error,
    contextProject,
    // upload
    handleFile,
    handlePaste,
    downloadTemplate,
    sheets,
    projectSheet,
    setProjectSheet,
    taskSheet,
    setTaskSheet,
    // match
    projectMap,
    setProjectMap,
    taskMap,
    setTaskMap,
    dayFirst,
    setDayFirst,
    confirmMapping,
    // review
    items,
    shown,
    filter,
    setFilter,
    decide,
    decideAll,
    fix,
    conflicts,
    conflictChoice,
    chooseConflict,
    missingAreas,
    areaChoice,
    setAreaChoice,
    areas: areaDocs.filter((a) => !a.archived),
    summary,
    summaryText: summaryText(summary),
    // import
    runImport,
    progress,
    log,
    undo,
    undoing,
    // Undo stays offered for 24 hours; undo() itself refuses after that.
    canUndo: Boolean(log && !log.undoneAt),
    downloadReport,
    openLog,
    reset,
  };
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pick(obj: Record<string, unknown> | undefined, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj?.[k] ?? null;
  return out;
}

function reportRows(items: ReviewItem[]) {
  return items.map((i) => ({
    sheet: i.sheet,
    row: i.rowNumber,
    kind: i.kind,
    name: i.kind === 'project' ? (i.project?.name ?? '') : (i.task?.name ?? ''),
    project: i.kind === 'task' ? (i.task?.project ?? '') : '',
    status: i.status,
    result: i.decision === 'create' ? 'Created' : i.decision === 'update' ? 'Updated' : 'Skipped',
    problems: i.problems.join('; '),
  }));
}

export type ProjectImport = ReturnType<typeof useProjectImport>;
export { cellText };
