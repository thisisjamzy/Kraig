'use client';

// Importing from a spreadsheet: the Time template (areas, sections,
// projects, tasks) or the Money template (wallets, income sources,
// baskets, basket items). Opened from Settings > Import and export, the
// Projects and project "New" menus (Time), and a basket's "Import items"
// (Money). The decisions are pure (src/shared/import: templates.ts,
// timeReview.ts, moneyReview.ts); this hook reads the file and what already
// exists, detects the template (and offers to switch when the file is the
// other kind), holds the person's choices, checks blocked tasks against
// the calendar for every date of a series, writes tagged with an import id
// (Time in batches of up to 450), keeps a log for Undo (24 hours) and the
// report, syncs Google Calendar once and leaves one notification.
//
// Steps: upload > match > review > confirm > importing > result.

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import {
  accountRef,
  accountsRef,
  areaRef,
  areasRef,
  bucketLineItemRef,
  bucketLineItemsRef,
  bucketRef,
  bucketsRef,
  categoriesRef,
  projectRef,
  projectsRef,
  sectionRef,
  sectionsRef,
  taskRef,
  tasksRef,
} from '@/src/shared/firestore/refs';
import { createBucket, createBucketLineItem, deleteBucket, deleteBucketLineItem, recalcBucketTotals } from '@/src/shared/firestore/aggregation';
import { defaultSectionId } from '@/src/shared/firestore/sections';
import { applyNotificationWrites } from '@/src/shared/firestore/notificationWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { usePreferences } from '@/src/shared/firestore/preferences';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { runCalendarSync } from '@/src/shared/calendarSync/runner';
import { useCalendarSyncStatus } from '@/src/shared/calendarSync/status';
import { checkOccurrences, defaultTimeMode } from '@/src/viewmodels/scheduling';
import { dateKey, expandRule, formatRRule, keyToDate, parseRRule, splitRule } from '@/src/viewmodels/recurrence';
import { buildScheduledTasks } from '@/src/logic/taskEdit/useLogic';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import { MAX_ROWS, cellText } from '@/src/shared/import/projectTasks';
import { nameKey } from '@/src/shared/import/names';
import { detectTemplate, mapColumns, sheetsOf, specFor, TEMPLATE_LABEL, type SheetSpec, type TemplateKind } from '@/src/shared/import/templates';
import { buildTimeReview, type AreaValues, type ProjectValues, type SectionValues, type TaskValues, type TimeExisting } from '@/src/shared/import/timeReview';
import { buildMoneyReview, type BasketItemValues, type BasketValues, type IncomeValues, type MoneyExisting, type WalletValues } from '@/src/shared/import/moneyReview';
import { impliedText, summarize, summaryText, type Decision, type ItemKind, type Mapping, type ReviewItem, type RowStatus } from '@/src/shared/import/review';
import type { FirestoreAccount, FirestoreArea, FirestoreBucket, FirestoreCategory, FirestoreProject, FirestoreSection, FirestoreTask } from '@/src/shared/firestore/types';

export type ImportStep = 'upload' | 'match' | 'review' | 'confirm' | 'importing' | 'result';

interface Sheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

/** A blocked task whose time clashes: import it as free, skip the clashing dates, without a time, or not at all. */
export type ConflictChoice = 'free' | 'skipDates' | 'unscheduled' | 'skip';
/** Updating a series' repeat: from today on, or the whole series. */
export type RepeatScope = 'future' | 'all';

export interface ImportLog {
  id: string;
  kind?: TemplateKind;
  at: Timestamp | null;
  created: {
    areas: string[];
    sections?: string[];
    projects: string[];
    tasks: string[];
    wallets?: string[];
    baskets?: string[];
    /** goalId/itemId */
    items?: string[];
  };
  updated: { path: string; before: Record<string, unknown> }[];
  undoneAt: Timestamp | null;
  summary: string;
}

export type Item = ReviewItem<unknown> & { conflictDates: string[] };

const BATCH = 450;
const UNDO_HOURS = 24;
const MAPPING_KEY = 'dreda.import.mapping';
const HORIZON_MONTHS = 12;
const SKIP_SHEETS = new Set(['read me', 'readme', 'lists']);

function readRemembered(kind: TemplateKind): Record<string, Record<string, string>> {
  try {
    const all = JSON.parse(localStorage.getItem(`${MAPPING_KEY}.${kind}`) ?? '{}');
    return typeof all === 'object' && all ? all : {};
  } catch {
    return {};
  }
}

function sheetFrom(name: string, rows: Record<string, unknown>[]): Sheet {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((h) => !/^__EMPTY/.test(h));
  return { name, headers, rows };
}

/** Which file sheet fills each template sheet: by name, else a lone sheet is Tasks (or Basket items). */
function assignSheets(kind: TemplateKind, sheets: Sheet[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const spec of sheetsOf(kind)) out[spec.name] = null;
  const unclaimed: Sheet[] = [];
  for (const s of sheets) {
    const spec = specFor(kind, s.name);
    if (spec && !out[spec.name]) out[spec.name] = s.name;
    else unclaimed.push(s);
  }
  const main = kind === 'time' ? 'Tasks' : 'Basket items';
  if (!out[main] && unclaimed.length) out[main] = unclaimed[0].name;
  return out;
}

const dateAt = (iso: string, minutes: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
};
const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
const ts = (iso: string | null) => (iso ? Timestamp.fromDate(dayStart(iso)) : null);
const thisMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function useProjectImport({ projectId = null, kind: wanted = null }: { projectId?: string | null; kind?: TemplateKind | null } = {}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { prefs } = usePreferences();
  const { ctx } = useCurrencyContext();
  const { includeFree } = useCalendarSyncStatus();
  const { data: projectDocs } = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? projectsRef(uid) : null), [uid]));
  const { data: taskDocs } = useFirestoreCollection<FirestoreTask>(useMemo(() => (uid ? tasksRef(uid) : null), [uid]));
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? areasRef(uid) : null), [uid]));
  const { data: sectionDocs } = useFirestoreCollection<FirestoreSection>(useMemo(() => (uid ? sectionsRef(uid) : null), [uid]));
  const { data: accountDocs } = useFirestoreCollection<FirestoreAccount>(useMemo(() => (uid ? accountsRef(uid) : null), [uid]));
  const { data: bucketDocs } = useFirestoreCollection<FirestoreBucket>(useMemo(() => (uid ? bucketsRef(uid) : null), [uid]));
  const { data: categoryDocs } = useFirestoreCollection<FirestoreCategory>(useMemo(() => (uid ? categoriesRef(uid) : null), [uid]));
  const contextProject = projectId ? (projectDocs.find((p) => p.id === projectId) ?? null) : null;

  const [kind, setKind] = useState<TemplateKind>(wanted ?? 'time');
  const [step, setStepState] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [oldTemplate, setOldTemplate] = useState(false);
  /** The file is the other template: offer to switch. */
  const [mismatch, setMismatch] = useState<TemplateKind | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [dayFirst, setDayFirst] = useState(prefs.dateFormat !== 'mm/dd/yyyy');
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { decision: Decision; decided: boolean }>>({});
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [conflictChoice, setConflictChoice] = useState<Record<string, ConflictChoice>>({});
  const [repeatScope, setRepeatScope] = useState<Record<string, RepeatScope>>({});
  const [createAnywayConfirmed, setCreateAnywayConfirmed] = useState(false);
  const [filter, setFilter] = useState<RowStatus | 'all'>('all');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<ImportLog | null>(null);
  const [undoing, setUndoing] = useState(false);
  /** Basket items, read once a Money file is reviewed. */
  const [moneyItems, setMoneyItems] = useState<MoneyExisting['items'] | null>(null);

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
    const usable = found.filter((s) => s.rows.length && !SKIP_SHEETS.has(nameKey(s.name)));
    const total = usable.reduce((s, x) => s + x.rows.length, 0);
    if (!usable.length || total === 0) return setError('That file has no rows to import.');
    if (total > MAX_ROWS) return setError(`That file has ${total.toLocaleString('en-US')} rows; up to ${MAX_ROWS.toLocaleString('en-US')} can be imported at once.`);
    setError(null);
    setFileName(name);
    setSheets(usable);
    const detected = detectTemplate(usable.map((s) => ({ name: s.name, headers: s.headers })));
    setOldTemplate(detected.old);
    const k = detected.kind ?? wanted ?? 'time';
    // Opened for one kind (a project, a basket) with a file of the other.
    if (wanted && detected.kind && detected.kind !== wanted) {
      setMismatch(detected.kind);
      return;
    }
    setMismatch(null);
    begin(k, usable);
  }

  /** Match the file to a template and go to Match columns. */
  function begin(k: TemplateKind, found: Sheet[] = sheets) {
    setKind(k);
    const a = assignSheets(k, found);
    setAssigned(a);
    const remembered = readRemembered(k);
    const maps: Record<string, Mapping> = {};
    for (const spec of sheetsOf(k)) {
      const s = found.find((x) => x.name === a[spec.name]);
      if (s) maps[spec.name] = mapColumns(spec, s.headers, remembered[spec.name] ?? {});
    }
    setMappings(maps);
    setOverrides({});
    setEdits({});
    setConflictChoice({});
    setRepeatScope({});
    setMismatch(null);
    setStep('match');
  }

  /** "This is a Money file": continue with the other import. */
  function switchKind() {
    if (mismatch) begin(mismatch);
  }

  async function handleFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const hidden = new Set((wb.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name));
      take(
        wb.SheetNames.filter((n) => !hidden.has(n)).map((n) => sheetFrom(n, XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n], { defval: '' }))),
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

  // ---- Match ----

  const specs: { spec: SheetSpec; sheet: Sheet }[] = sheetsOf(kind)
    .map((spec) => ({ spec, sheet: sheets.find((s) => s.name === assigned[spec.name]) }))
    .filter((x): x is { spec: SheetSpec; sheet: Sheet } => Boolean(x.sheet));

  function assignSheet(specName: string, sheetName: string | null) {
    setAssigned((a) => ({ ...a, [specName]: sheetName }));
    const spec = sheetsOf(kind).find((s) => s.name === specName)!;
    const s = sheets.find((x) => x.name === sheetName);
    setMappings((m) => ({ ...m, [specName]: s ? mapColumns(spec, s.headers, readRemembered(kind)[specName] ?? {}) : {} }));
  }
  function setColumn(specName: string, header: string, key: string) {
    setMappings((m) => ({ ...m, [specName]: { ...(m[specName] ?? {}), [header]: key } }));
  }

  function confirmMapping() {
    try {
      const saved = readRemembered(kind);
      for (const { spec } of specs) saved[spec.name] = Object.fromEntries(Object.entries(mappings[spec.name] ?? {}).map(([h, k]) => [nameKey(h), k]));
      localStorage.setItem(`${MAPPING_KEY}.${kind}`, JSON.stringify(saved));
    } catch {
      // Not remembered on this device.
    }
    if (!specs.some(({ spec }) => Object.values(mappings[spec.name] ?? {}).includes('name'))) return setError('Match a column to Name first.');
    setError(null);
    setStep('review');
  }

  // ---- What exists ----

  const timeExisting: TimeExisting = useMemo(
    () => ({
      areas: areaDocs.map((a) => ({ id: a.id, name: a.name, archived: a.archived, emoji: a.emoji, color: a.color, description: a.description ?? '' })),
      sections: sectionDocs.map((s) => ({ id: s.id, name: s.name, areaId: s.areaId, archived: s.archived, description: s.description ?? '' })),
      projects: projectDocs.map((p) => ({
        id: p.id,
        name: p.name,
        archived: p.status === 'Archived',
        areaId: p.areaId,
        sectionId: p.bucketId,
        description: p.description ?? '',
        start: p.startDate ? dateKey(p.startDate.toDate()) : null,
        end: p.endDate ? dateKey(p.endDate.toDate()) : null,
        status: p.status,
        priority: p.priority,
        tags: p.tags ?? [],
      })),
      tasks: taskDocs
        .filter((t) => !t.archived && !t.parentTaskId)
        .map((t) => {
          const start = t.startTime?.toDate() ?? null;
          const end = t.dueDate?.toDate() ?? null;
          const timed = !t.allDay && start !== null;
          return {
            id: t.id,
            projectId: t.projectId,
            title: t.title,
            notes: t.notes ?? '',
            type: t.type,
            status: t.status ?? (t.done ? 'Done' : 'Pending'),
            quadrant: t.quadrant ?? null,
            priority: t.priority,
            date: start ? dateKey(start) : end ? dateKey(end) : null,
            allDay: !timed,
            start: timed ? start!.getHours() * 60 + start!.getMinutes() : null,
            end: timed && end ? end.getHours() * 60 + end.getMinutes() : null,
            timeMode: t.timeMode ?? null,
            rrule: t.rrule ?? null,
            tags: t.tags ?? [],
          };
        }),
    }),
    [areaDocs, sectionDocs, projectDocs, taskDocs]
  );

  // Basket items live under each basket: read them once a Money review starts.
  useEffect(() => {
    if (kind !== 'money' || step !== 'review' || moneyItems || !uid) return;
    let live = true;
    void Promise.all(
      bucketDocs.map(async (b) => {
        const snap = await getDocs(bucketLineItemsRef(uid, b.id));
        return snap.docs.map((d) => {
          const i = d.data();
          return {
            id: d.id,
            basketId: b.id,
            name: i.name,
            amount: Number(i.amount) || 0,
            priority: i.priority,
            necessity: i.necessity,
            dueDay: i.dueDate ? i.dueDate.toDate().getDate() : null,
            accountId: i.accountId ?? null,
            frequency: i.recurrence?.frequency ?? null,
          };
        });
      })
    )
      .then((lists) => live && setMoneyItems(lists.flat()))
      .catch(() => live && setError('Your basket items could not be read; duplicates of them are not checked.'));
    return () => {
      live = false;
    };
  }, [kind, step, moneyItems, uid, bucketDocs]);

  const moneyExisting: MoneyExisting = useMemo(
    () => ({
      wallets: accountDocs.map((a) => ({ id: a.id, name: a.name, type: a.type, archived: a.archived, usableForPlan: a.usableForPlan })),
      baskets: bucketDocs.map((b) => ({ id: b.id, name: b.name, type: b.type ?? 'Expense', kind: b.kind ?? 'Variable', archived: b.archived, categoryId: b.categoryId ?? null, defaultPaidFrom: b.defaultPaidFrom ?? null })),
      items: moneyItems ?? [],
      categories: categoryDocs.map((c) => ({ id: c.id, name: c.name, type: c.transactionType })),
    }),
    [accountDocs, bucketDocs, moneyItems, categoryDocs]
  );

  // ---- Review ----

  const rawItems = useMemo(() => {
    if (step === 'upload' || step === 'match') return [];
    const rows = (specName: string) => {
      const sheet = sheets.find((s) => s.name === assigned[specName]);
      if (!sheet) return null;
      const patched = sheet.rows.map((row, i) => {
        const e = edits[`${sheet.name}:${i + 2}`];
        return e ? { ...row, ...e } : row;
      });
      return { sheet: sheet.name, rows: patched, mapping: mappings[specName] ?? {} };
    };
    if (kind === 'time') {
      return buildTimeReview({
        areas: rows('Areas'),
        sections: rows('Sections'),
        projects: rows('Projects'),
        tasks: rows('Tasks'),
        existing: timeExisting,
        dayFirst,
        contextProject: contextProject ? { id: contextProject.id, name: contextProject.name } : null,
        defaultMode: (type) => prefs.timeModeByType[type] ?? defaultTimeMode(type),
        includeFree,
        defaultMinutes: prefs.defaultTaskMinutes,
      }) as ReviewItem<unknown>[];
    }
    return buildMoneyReview({
      wallets: rows('Wallets'),
      income: rows('Income sources'),
      baskets: rows('Baskets'),
      items: rows('Basket items'),
      existing: moneyExisting,
      dayFirst,
      thisMonth: thisMonthKey(),
    }) as ReviewItem<unknown>[];
  }, [step, kind, sheets, assigned, mappings, edits, timeExisting, moneyExisting, dayFirst, contextProject, prefs, includeFree]);

  // Blocked tasks with a time: every date (12 months ahead, or to the end) against the calendar.
  const scheduled = useMemo(() => buildScheduledTasks(taskDocs, ''), [taskDocs]);
  const conflicts = useMemo(() => {
    const out = new Map<string, string[]>();
    if (kind !== 'time') return out;
    for (const item of rawItems) {
      const t = item.values as TaskValues;
      if (item.kind !== 'task' || item.status === 'problem' || !t.date || t.start === null || t.end === null || t.timeMode !== 'blocked') continue;
      const first = dateAt(t.date, t.start);
      const length = (t.end - t.start) * 60_000;
      let starts = [first];
      if (t.rule) {
        const horizon = new Date(first.getFullYear(), first.getMonth() + HORIZON_MONTHS, first.getDate());
        const until = t.rule.until ? new Date(`${t.rule.until}T23:59:59`) : null;
        starts = expandRule(t.rule, first, until && until < horizon ? until : horizon).filter((d) => !t.skip.includes(dateKey(d)));
      }
      const exclude = item.match && !item.match.sameFile ? item.match.id : null;
      const clashes = checkOccurrences(
        starts.map((s) => ({ start: s, end: new Date(s.getTime() + length) })),
        'blocked',
        exclude,
        scheduled
      )
        .filter((o) => o.status === 'conflict')
        .map((o) => dateKey(o.start));
      if (clashes.length) out.set(item.key, clashes);
    }
    return out;
  }, [kind, rawItems, scheduled]);

  const items: Item[] = useMemo(
    () =>
      rawItems.map((item) => {
        const o = overrides[item.key];
        const conflictDates = conflicts.get(item.key) ?? [];
        const decision = o?.decision ?? item.decision;
        const needsConflict = conflictDates.length > 0 && decision !== 'skip' && !conflictChoice[item.key];
        const needsScope = decision === 'update' && item.changes.some((c) => c.field === 'Repeats') && Boolean((item.values as TaskValues).rule) && !repeatScope[item.key];
        const decided = (o ? o.decided : item.decided) && !needsConflict && !needsScope;
        return { ...item, decision, decided, conflictDates };
      }),
    [rawItems, overrides, conflicts, conflictChoice, repeatScope]
  );

  function decide(key: string, decision: Decision) {
    setOverrides((o) => ({ ...o, [key]: { decision, decided: true } }));
    if (decision === 'create') setCreateAnywayConfirmed(true);
  }
  /** "Skip all duplicates" / "Update all duplicates" for one kind. */
  function decideAll(kindOf: ItemKind, decision: 'skip' | 'update') {
    setOverrides((o) => {
      const next = { ...o };
      for (const i of items) if (i.kind === kindOf && i.status === 'duplicate' && (decision === 'skip' || (i.match && !i.match.sameFile))) next[i.key] = { decision, decided: true };
      return next;
    });
  }
  /** Fix a problem row: new values for its cells (by column key), re-read on the spot. */
  function fix(item: Item, values: Record<string, string>) {
    const specName = Object.keys(assigned).find((k) => assigned[k] === item.sheet);
    const map = specName ? (mappings[specName] ?? {}) : {};
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const header = Object.keys(map).find((h) => map[h] === key);
      if (header) patch[header] = value;
    }
    const k = `${item.sheet}:${item.rowNumber}`;
    setEdits((e) => ({ ...e, [k]: { ...(e[k] ?? {}), ...patch } }));
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
  function chooseScope(key: string, scope: RepeatScope) {
    setRepeatScope((s) => ({ ...s, [key]: scope }));
  }

  const summary = summarize(items);
  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter);

  // ---- Import ----

  async function runImport() {
    if (!uid || summary.needAttention > 0) return;
    setStep('importing');
    setError(null);
    const importId = crypto.randomUUID();
    const created: ImportLog['created'] = { areas: [], sections: [], projects: [], tasks: [], wallets: [], baskets: [], items: [] };
    const updated: ImportLog['updated'] = [];
    try {
      if (kind === 'time') await writeTime(uid, importId, created, updated);
      else await writeMoney(uid, importId, created, updated);
      const text = summaryText(summary);
      const entry: Omit<ImportLog, 'id'> = { kind, at: Timestamp.now(), created, updated, undoneAt: null, summary: text };
      await setDoc(doc(getFirebaseFirestore(), 'users', uid, 'settings', `import-${importId}`), { ...entry, fileName, report: reportRows(items) } as never);
      setLog({ id: importId, ...entry });
      if (kind === 'time') void runCalendarSync({ reason: 'manual' }).catch(() => undefined);
      await notify(uid, importId, created, text);
      setStep('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import stopped part way. What was written so far can be undone.');
      setLog({ id: importId, kind, at: Timestamp.now(), created, updated, undoneAt: null, summary: 'Stopped part way' });
      setStep('result');
    }
  }

  async function commit(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
    const db = getFirebaseFirestore();
    setProgress({ done: 0, total: ops.length });
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = writeBatch(db);
      ops.slice(i, i + BATCH).forEach((op) => op(batch));
      await batch.commit();
      setProgress({ done: Math.min(ops.length, i + BATCH), total: ops.length });
    }
  }

  async function writeTime(uid: string, importId: string, created: ImportLog['created'], updated: ImportLog['updated']) {
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    const stamp = { updatedAt: serverTimestamp() };
    const remember = (path: string, before: Record<string, unknown> | undefined, keys: string[]) => updated.push({ path, before: pick(before, keys) });

    // Areas
    const areaId = new Map<string, string>();
    const areaColor = new Map<string, string>();
    for (const i of items.filter((x) => x.kind === 'area')) {
      const v = i.values as AreaValues;
      const k = nameKey(v.name);
      if (i.match && !i.match.sameFile) {
        areaId.set(k, i.match.id);
        if (i.decision === 'update') {
          const before = areaDocs.find((a) => a.id === i.match!.id);
          remember(`areas/${i.match.id}`, before as never, ['emoji', 'color', 'description', 'archived']);
          ops.push((b) =>
            b.update(areaRef(uid, i.match!.id), {
              ...(v.icon ? { emoji: v.icon } : {}),
              ...(v.color ? { color: v.color } : {}),
              ...(v.description ? { description: v.description } : {}),
              ...(v.archived !== null ? { archived: v.archived } : {}),
              ...stamp,
            })
          );
        }
      } else if (i.decision === 'create') {
        const id = crypto.randomUUID();
        const color = v.color || PROJECT_COLORS[(created.areas.length + 1) % PROJECT_COLORS.length];
        areaId.set(k, id);
        areaColor.set(k, color);
        created.areas.push(id);
        created.sections!.push(defaultSectionId(id));
        ops.push((b) =>
          b.set(areaRef(uid, id), { name: v.name, emoji: v.icon || null, color, description: v.description || `Created by an import (${fileName ?? 'spreadsheet'})`, archived: v.archived ?? false, importId, createdAt: serverTimestamp(), ...stamp } as never)
        );
        ops.push((b) =>
          b.set(sectionRef(uid, defaultSectionId(id)), { name: 'General', emoji: null, color, description: 'Projects not sorted into a specific section.', areaId: id, archived: false, isDefault: true, createdAt: serverTimestamp(), ...stamp } as never)
        );
      }
    }

    // Sections
    const sectionId = new Map<string, string>();
    for (const i of items.filter((x) => x.kind === 'section')) {
      const v = i.values as SectionValues;
      const k = `${nameKey(v.area)}|${nameKey(v.name)}`;
      if (i.match && !i.match.sameFile) {
        sectionId.set(k, i.match.id);
        if (i.decision === 'update') {
          remember(`sections/${i.match.id}`, sectionDocs.find((s) => s.id === i.match!.id) as never, ['description', 'archived', 'emoji', 'color']);
          ops.push((b) =>
            b.update(sectionRef(uid, i.match!.id), {
              ...(v.description ? { description: v.description } : {}),
              ...(v.archived !== null ? { archived: v.archived } : {}),
              ...(v.icon ? { emoji: v.icon } : {}),
              ...(v.color ? { color: v.color } : {}),
              ...stamp,
            })
          );
        }
      } else if (i.decision === 'create') {
        const area = areaId.get(nameKey(v.area));
        if (!area) continue;
        const id = crypto.randomUUID();
        sectionId.set(k, id);
        created.sections!.push(id);
        ops.push((b) =>
          b.set(sectionRef(uid, id), { name: v.name, emoji: v.icon || null, color: v.color || areaColor.get(nameKey(v.area)) || PROJECT_COLORS[0], description: v.description || 'Imported from a spreadsheet.', areaId: area, archived: v.archived ?? false, importId, createdAt: serverTimestamp(), ...stamp } as never)
        );
      }
    }

    // Projects
    const projectId = new Map<string, string>();
    if (contextProject) projectId.set(nameKey(contextProject.name), contextProject.id);
    for (const i of items.filter((x) => x.kind === 'project')) {
      const v = i.values as ProjectValues;
      const k = nameKey(v.name);
      const area = v.area ? (areaId.get(nameKey(v.area)) ?? null) : null;
      const section = v.area && v.section ? (sectionId.get(`${nameKey(v.area)}|${nameKey(v.section)}`) ?? null) : null;
      if (i.match && !i.match.sameFile) {
        projectId.set(k, i.match.id);
        if (i.decision !== 'update') continue;
        const id = i.match.id;
        remember(`projects/${id}`, projectDocs.find((p) => p.id === id) as never, ['areaId', 'bucketId', 'description', 'startDate', 'endDate', 'status', 'priority', 'tags', 'color']);
        ops.push((b) =>
          b.update(projectRef(uid, id), {
            ...(area ? { areaId: area } : {}),
            ...(section ? { bucketId: section } : {}),
            ...(v.description ? { description: v.description } : {}),
            ...(v.start ? { startDate: ts(v.start) } : {}),
            ...(v.end ? { endDate: ts(v.end) } : {}),
            ...(v.priority ? { priority: v.priority } : {}),
            ...(v.tags.length ? { tags: v.tags } : {}),
            ...(v.color && PROJECT_COLORS.includes(v.color as never) ? { color: v.color } : {}),
            // "Restore and update": an archived project comes back.
            status: v.status ?? (i.match!.archived ? 'Active' : (projectDocs.find((p) => p.id === id)?.status ?? 'Active')),
            ...stamp,
          } as never)
        );
      } else if (i.decision === 'create') {
        const id = crypto.randomUUID();
        projectId.set(k, id);
        created.projects.push(id);
        const end = ts(v.end);
        ops.push((b) =>
          b.set(projectRef(uid, id), {
            name: v.name,
            emoji: null,
            areaId: area,
            bucketId: section ?? (area ? defaultSectionId(area) : null),
            color: PROJECT_COLORS.find((c) => c.toLowerCase() === v.color.toLowerCase()) ?? PROJECT_COLORS[created.projects.length % PROJECT_COLORS.length],
            priority: v.priority ?? 'Medium',
            startDate: ts(v.start),
            endDate: end,
            originalEndDate: end,
            rescheduleCount: 0,
            status: v.status ?? 'Active',
            description: v.description || 'Imported from a spreadsheet.',
            tags: v.tags,
            importId,
            createdAt: serverTimestamp(),
            ...stamp,
          } as never)
        );
      }
    }

    // Tasks
    const today = dateKey(new Date());
    for (const i of items.filter((x) => x.kind === 'task')) {
      if (i.decision === 'skip') continue;
      const t = i.values as TaskValues;
      const pid = t.project ? (projectId.get(nameKey(t.project)) ?? null) : null;
      const choice = conflictChoice[i.key];
      const timed = t.date !== null && t.start !== null && t.end !== null && choice !== 'unscheduled';
      const startAt = t.date ? (timed ? dateAt(t.date, t.start!) : dateAt(t.date, 0)) : null;
      const endAt = t.date ? (timed ? dateAt(t.date, t.end!) : dateAt(t.date, 23 * 60 + 59)) : null;
      const mode = choice === 'free' ? 'free' : t.timeMode;
      const skipKeys = [...t.skip, ...(choice === 'skipDates' ? i.conflictDates : [])];
      const exceptions = t.rule ? Object.fromEntries(skipKeys.map((k) => [k, { deleted: true }])) : {};
      const done = t.status === 'Done';
      const pushable = timed && t.push;
      const schedule = {
        startTime: startAt ? Timestamp.fromDate(startAt) : null,
        dueDate: endAt ? Timestamp.fromDate(endAt) : null,
        allDay: !timed,
        timeMode: mode,
        pushToGoogle: t.push,
        ...(pushable ? { googleSync: { state: 'pending' } } : {}),
      };

      if (i.decision === 'update' && i.match && !i.match.sameFile) {
        const id = i.match.id;
        const before = taskDocs.find((x) => x.id === id);
        const fields: Record<string, unknown> = {
          ...(t.description ? { notes: t.description } : {}),
          ...(i.changes.some((c) => c.field === 'Type') ? { type: t.type } : {}),
          ...(i.changes.some((c) => c.field === 'Status') ? { status: t.status, done } : {}),
          ...(t.quadrant ? { quadrant: t.quadrant } : {}),
          ...(t.priority ? { priority: t.priority } : {}),
          ...(t.tags.length ? { tags: t.tags } : {}),
          ...(t.subtasks.length && !(before?.subtasks ?? []).length ? { subtasks: t.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })) } : {}),
          ...(startAt ? schedule : { timeMode: mode, pushToGoogle: t.push }),
          ...stamp,
        };
        const repeatChanged = i.changes.some((c) => c.field === 'Repeats');
        if (repeatChanged && repeatScope[i.key] === 'future' && before?.rrule && before.startTime) {
          // This and future: the old series ends before today, a new one carries on.
          const oldRule = parseRRule(before.rrule);
          const cut = splitRule(oldRule!, before.startTime.toDate(), today);
          remember(`tasks/${id}`, before as never, ['rrule']);
          ops.push((b) => b.update(taskRef(uid, id), { rrule: cut.before ? formatRRule(cut.before) : before.rrule, ...stamp }));
          const nextId = crypto.randomUUID();
          created.tasks.push(nextId);
          const from = keyToDate(today);
          const s = startAt && t.start !== null ? dateAt(today, t.start) : from;
          const e = endAt && t.end !== null ? dateAt(today, t.end) : dateAt(today, 23 * 60 + 59);
          ops.push((b) =>
            b.set(taskRef(uid, nextId), {
              ...stripId(before),
              ...fields,
              startTime: Timestamp.fromDate(s),
              dueDate: Timestamp.fromDate(e),
              originalStartTime: Timestamp.fromDate(s),
              originalDueDate: Timestamp.fromDate(e),
              rrule: t.rrule,
              exceptions,
              googleSync: pushable ? { state: 'pending' } : null,
              importId,
              createdAt: serverTimestamp(),
            } as never)
          );
          continue;
        }
        remember(`tasks/${id}`, before as never, Object.keys(fields).concat(repeatChanged ? ['rrule', 'exceptions'] : []).filter((k) => k !== 'updatedAt'));
        ops.push((b) => b.update(taskRef(uid, id), { ...fields, ...(repeatChanged ? { rrule: t.rrule, exceptions } : {}) } as never));
        continue;
      }

      const id = crypto.randomUUID();
      created.tasks.push(id);
      ops.push((b) =>
        b.set(taskRef(uid, id), {
          title: t.name,
          emoji: null,
          type: t.type,
          priority: t.priority ?? (t.quadrant === 'do' ? 'High' : t.quadrant === 'eliminate' ? 'Low' : 'Medium'),
          projectId: pid,
          areaId: null,
          bucketId: null,
          parentTaskId: null,
          done: done && !t.rule,
          status: t.rule ? 'Pending' : t.status,
          ...schedule,
          quadrant: t.quadrant,
          ...(t.rule && startAt ? { rrule: t.rrule, exceptions } : {}),
          originalDueDate: schedule.dueDate,
          originalStartTime: schedule.startTime,
          rescheduleCount: 0,
          completedAt: done && !t.rule ? Timestamp.now() : null,
          cancelledAt: t.status === 'Cancelled' && !t.rule ? Timestamp.now() : null,
          calendarEventId: null,
          dependsOnTaskId: null,
          estimatedCost: null,
          linkedTransactionId: null,
          notes: t.description || 'Imported from a spreadsheet.',
          tags: t.tags,
          subtasks: t.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
          archived: false,
          createdBy: uid,
          importId,
          createdAt: serverTimestamp(),
          ...stamp,
        } as never)
      );
    }
    await commit(ops);
  }

  async function writeMoney(uid: string, importId: string, created: ImportLog['created'], updated: ImportLog['updated']) {
    const db = getFirebaseFirestore();
    const thisMonth = thisMonthKey();
    let done = 0;
    const total = items.filter((i) => i.decision !== 'skip').length;
    const tick = () => setProgress({ done: ++done, total });
    setProgress({ done: 0, total });

    // Wallets (one batch)
    const walletId = new Map<string, string>();
    const walletBatch = writeBatch(db);
    let walletWrites = 0;
    for (const i of items.filter((x) => x.kind === 'wallet')) {
      const v = i.values as WalletValues;
      if (i.match && !i.match.sameFile) {
        walletId.set(nameKey(v.name), i.match.id);
        if (i.decision === 'update') {
          updated.push({ path: `accounts/${i.match.id}`, before: pick(accountDocs.find((a) => a.id === i.match!.id) as never, ['type', 'usableForPlan']) });
          walletBatch.update(accountRef(uid, i.match.id), { type: v.type, ...(v.usable !== null ? { usableForPlan: v.usable } : {}) });
          walletWrites++;
          tick();
        }
      } else if (i.decision === 'create') {
        const id = crypto.randomUUID();
        walletId.set(nameKey(v.name), id);
        created.wallets!.push(id);
        walletBatch.set(accountRef(uid, id), {
          name: v.name,
          shortName: v.name.slice(0, 5),
          type: v.type,
          currency: ctx.base,
          startingBalance: v.opening,
          currentBalance: v.opening,
          notes: 'Imported from a spreadsheet.',
          archived: false,
          notSpendable: false,
          frozen: false,
          ...(v.usable !== null && v.type === 'Savings Account' ? { usableForPlan: v.usable } : {}),
          importId,
        } as never);
        walletWrites++;
        tick();
      }
    }
    if (walletWrites) await walletBatch.commit();
    const wallet = (name: string) => (name ? (walletId.get(nameKey(name)) ?? null) : null);

    // Baskets
    const basketId = new Map<string, string>(); // type|name and name
    const basketOf = new Map<string, BasketValues>();
    for (const i of items.filter((x) => x.kind === 'basket')) {
      const v = i.values as BasketValues;
      const paid = wallet(v.paidFrom);
      let id: string | null = i.match && !i.match.sameFile ? i.match.id : null;
      if (id && i.decision === 'update') {
        const before = bucketDocs.find((b) => b.id === id);
        updated.push({ path: `buckets/${id}`, before: pick(before as never, ['kind', 'categoryId', 'defaultPaidFrom']) });
        await updateDoc(bucketRef(uid, id), {
          ...(v.type === 'Expense' ? { kind: v.kind } : {}),
          ...(v.categoryId ? { categoryId: v.categoryId } : {}),
          ...(paid ? { defaultPaidFrom: `account:${paid}` } : {}),
          updatedAt: serverTimestamp(),
        });
        tick();
      } else if (!id && i.decision === 'create') {
        id = await createBucket(uid, {
          name: v.name,
          description: 'Imported from a spreadsheet.',
          deadline: null,
          currency: ctx.base,
          kind: v.kind,
          type: v.type,
          categoryId: v.categoryId,
          startMonth: v.startMonth,
          repeats: v.repeats,
          defaultPaidFrom: paid ? `account:${paid}` : null,
          importId,
        });
        created.baskets!.push(id);
        tick();
      }
      if (id) {
        basketId.set(`${v.type}|${nameKey(v.name)}`, id);
        if (!basketId.has(nameKey(v.name))) basketId.set(nameKey(v.name), id);
        basketOf.set(id, v);
      }
    }

    const dueIn = (month: string, day: number) => {
      const [y, m] = month.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return new Date(y, m - 1, Math.min(day, last));
    };

    // Basket items and income sources
    for (const i of items.filter((x) => x.kind === 'basketItem' || x.kind === 'income')) {
      if (i.decision === 'skip') continue;
      const income = i.kind === 'income';
      const v = i.values as BasketItemValues & Omit<IncomeValues, 'frequency'> & { frequency: IncomeValues['frequency'] | BasketItemValues['frequency'] };
      const goalId = income ? basketId.get(`Income|${nameKey(v.basket)}`) : basketId.get(nameKey(v.basket));
      if (!goalId) continue;
      const basket = basketOf.get(goalId) ?? (bucketDocs.find((b) => b.id === goalId) as unknown as BasketValues | undefined);
      const month = basket?.startMonth ?? thisMonth;
      const dueDate = income
        ? v.day
          ? dueIn(month, v.day)
          : null
        : v.dueDate
          ? dayStart(v.dueDate)
          : v.dueDay
            ? dueIn(month, v.dueDay)
            : null;
      const raw = v.frequency as IncomeValues['frequency'] | BasketItemValues['frequency'];
      const frequency = raw === 'Once' ? null : raw;
      const input = {
        name: v.name,
        description: 'Imported from a spreadsheet.',
        amount: v.amount,
        priority: income ? ('High' as const) : v.priority,
        necessity: income ? ('MustHave' as const) : v.necessity,
        categoryId: basket?.categoryId ?? '',
        categoryType: (income ? 'Income' : (basket?.type ?? 'Expense')) as 'Expense' | 'Income' | 'Savings' | 'Transfer',
        accountId: wallet(income ? v.wallet : v.paidFrom),
        dueDate,
        recurrence: frequency ? { frequency, interval: 1 } : null,
        ...(income
          ? { incomeSubtype: v.subtype }
          : {
              automation: { mode: v.automation, trigger: 'due' as const, incomeItemId: null },
              notBefore: v.notBefore ? dayStart(v.notBefore) : null,
              neededBy: v.neededBy ? dayStart(v.neededBy) : null,
              splittable: v.splittable,
            }),
        importId,
      };
      if (i.decision === 'update' && i.match && !i.match.sameFile) {
        const [gid, itemId] = income ? i.match.id.split('/') : [goalId, i.match.id];
        const ref = bucketLineItemRef(uid, gid, itemId);
        const before = (await getDoc(ref)).data();
        updated.push({ path: `buckets/${gid}/lineItems/${itemId}`, before: pick(before as never, ['amount', 'priority', 'necessity', 'dueDate', 'recurrence']) });
        await updateDoc(ref, {
          amount: v.amount,
          ...(income ? {} : { priority: v.priority, necessity: v.necessity }),
          ...(dueDate ? { dueDate: Timestamp.fromDate(dueDate) } : {}),
          ...(i.changes.some((c) => c.field === 'Repeats') ? { recurrence: input.recurrence } : {}),
          updatedAt: serverTimestamp(),
        } as never);
        await recalcBucketTotals(uid, gid);
        tick();
        continue;
      }
      const itemId = await createBucketLineItem(uid, goalId, basket?.kind ?? 'Variable', input);
      created.items!.push(`${goalId}/${itemId}`);
      tick();
    }
  }

  async function notify(uid: string, importId: string, created: ImportLog['created'], text: string) {
    const now = new Date();
    const n = kind === 'time' ? created.tasks.length : (created.items?.length ?? 0);
    const noun = kind === 'time' ? (n === 1 ? 'task' : 'tasks') : n === 1 ? 'item' : 'items';
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
          title: `Import finished: ${n} ${noun} added`,
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
  }

  /** Undo (within 24 hours): removes what the import created, puts back what it changed. */
  async function undo() {
    if (!uid || !log || undoing) return;
    if (log.at && Date.now() - log.at.toMillis() > UNDO_HOURS * 3_600_000) return setError('Undo is only possible for 24 hours after an import.');
    setUndoing(true);
    const db = getFirebaseFirestore();
    const c = log.created;
    try {
      // Money first: items and baskets go through the app's own deletes (totals, links).
      for (const path of c.items ?? []) {
        const [goalId, itemId] = path.split('/');
        await deleteBucketLineItem(uid, goalId, itemId).catch(() => undefined);
      }
      for (const id of c.baskets ?? []) await deleteBucket(uid, id).catch(() => undefined);
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
        ...c.tasks.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(taskRef(uid, id))),
        ...c.projects.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(projectRef(uid, id))),
        ...(c.sections ?? []).map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(sectionRef(uid, id))),
        // Areas are never deleted (archive in place).
        ...c.areas.map((id) => (b: ReturnType<typeof writeBatch>) => b.update(areaRef(uid, id), { archived: true, updatedAt: serverTimestamp() })),
        ...(c.wallets ?? []).map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(accountRef(uid, id))),
        ...log.updated.map((u) => (b: ReturnType<typeof writeBatch>) => b.update(doc(db, 'users', uid, ...(u.path.split('/') as [string, ...string[]])), u.before)),
      ];
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH).forEach((op) => op(batch));
        await batch.commit();
      }
      for (const u of log.updated) {
        const m = u.path.match(/^buckets\/([^/]+)\/lineItems\//);
        if (m) await recalcBucketTotals(uid, m[1]).catch(() => undefined);
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
    const csv = [['Sheet', 'Row', 'Kind', 'Name', 'In', 'Status', 'Result', 'Details'], ...rows.map((r) => [r.sheet, String(r.row), r.kind, r.name, r.group, r.status, r.result, r.details])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dreda-import-report-${dateKey(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Opens a past import's log (from the notification's "Open the report"). */
  async function openLog(importId: string) {
    if (!uid) return;
    const snap = await getDoc(doc(getFirebaseFirestore(), 'users', uid, 'settings', `import-${importId}`));
    if (!snap.exists()) return;
    const data = snap.data() as Omit<ImportLog, 'id'> & { updated?: unknown[] };
    // Logs from before Money imports kept { collection, id }.
    const updatedList = (data.updated ?? []).map((u) => {
      const x = u as { path?: string; collection?: string; id?: string; before: Record<string, unknown> };
      return { path: x.path ?? `${x.collection}/${x.id}`, before: x.before };
    });
    setLog({ id: importId, ...data, updated: updatedList });
    if (data.kind) setKind(data.kind);
    setStep('result');
  }

  function reset() {
    setSheets([]);
    setFileName(null);
    setLog(null);
    setError(null);
    setMismatch(null);
    setMoneyItems(null);
    setStep('upload');
  }

  return {
    step,
    setStep,
    kind,
    kindLabel: TEMPLATE_LABEL[kind],
    wanted,
    fileName,
    error,
    contextProject,
    // upload
    handleFile,
    handlePaste,
    mismatch,
    switchKind,
    oldTemplate,
    sheets,
    // match
    specs,
    allSpecs: sheetsOf(kind),
    assigned,
    assignSheet,
    mappings,
    setColumn,
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
    conflictChoice,
    chooseConflict,
    repeatScope,
    chooseScope,
    createAnywayConfirmed,
    summary,
    summaryText: summaryText(summary),
    implied: impliedText(items),
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

function pick(obj: Record<string, unknown> | undefined, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj?.[k] ?? null;
  return out;
}

function stripId(task: FirestoreTask) {
  const { id: _id, googleSync: _sync, ...rest } = task;
  void _id;
  void _sync;
  return rest;
}

function reportRows(items: ReviewItem<unknown>[]) {
  return items.map((i) => ({
    sheet: i.sheet,
    row: i.rowNumber ?? '',
    kind: i.kind,
    name: i.name,
    group: i.group,
    status: i.status,
    result: i.status === 'linked' ? 'Linked to existing' : i.decision === 'create' ? 'Created' : i.decision === 'update' ? 'Updated' : 'Skipped',
    details: [...i.problems, ...i.notes, ...i.changes.map((c) => `${c.field}: ${c.from} to ${c.to}`)].join('; '),
  }));
}

export type ProjectImport = ReturnType<typeof useProjectImport>;
export { cellText };
