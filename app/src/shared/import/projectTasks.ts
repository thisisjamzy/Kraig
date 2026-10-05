// Importing projects and tasks from a spreadsheet: everything that can be
// decided without Firestore (pure, tested in test/importTasks.test.ts).
//   - which template a file is (tasks for one project, projects and tasks
//     in one sheet with a Project column, or Projects and Tasks sheets);
//   - matching its columns to fields, by header and common synonyms;
//   - reading values: dd/mm/yyyy (or ISO, or Excel's date numbers) dates,
//     24-hour or am/pm times, importance words or urgent/important yes-no
//     columns, "weekly on Monday" repeats, semicolon-separated subtasks;
//   - the duplicate checks, against what exists (archived projects
//     included) and within the file;
//   - each row's status and the summary sentence.
// src/logic/importData/useProjectImport.ts reads the existing data, checks
// time conflicts and writes.

import { formatRRule, WEEKDAYS, type RecurrenceRule, type Weekday } from '../../viewmodels/recurrence';
import type { Quadrant } from '../firestore/types';

export const MAX_ROWS = 2000;

// ---------------------------------------------------------------------------
// Fields and column matching

export type ProjectField = 'name' | 'area' | 'description' | 'start' | 'end' | 'status' | 'tags' | 'color';
export type TaskField =
  | 'project'
  | 'name'
  | 'description'
  | 'date'
  | 'start'
  | 'end'
  | 'importance'
  | 'urgent'
  | 'important'
  | 'type'
  | 'timeMode'
  | 'status'
  | 'repeats'
  | 'subtasks';

export const PROJECT_FIELDS: { key: ProjectField; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'area', label: 'Area' },
  { key: 'description', label: 'Description' },
  { key: 'start', label: 'Start date' },
  { key: 'end', label: 'End date' },
  { key: 'status', label: 'Status' },
  { key: 'tags', label: 'Tags' },
  { key: 'color', label: 'Color' },
];

export const TASK_FIELDS: { key: TaskField; label: string }[] = [
  { key: 'project', label: 'Project' },
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'date', label: 'Date' },
  { key: 'start', label: 'Start time' },
  { key: 'end', label: 'End time' },
  { key: 'importance', label: 'Importance' },
  { key: 'urgent', label: 'Urgent (yes or no)' },
  { key: 'important', label: 'Important (yes or no)' },
  { key: 'type', label: 'Type' },
  { key: 'timeMode', label: 'Time mode' },
  { key: 'status', label: 'Status' },
  { key: 'repeats', label: 'Repeats' },
  { key: 'subtasks', label: 'Subtasks' },
];

const PROJECT_SYNONYMS: Record<ProjectField, string[]> = {
  name: ['name', 'project', 'project name', 'title'],
  area: ['area', 'area of life', 'category', 'life area'],
  description: ['description', 'notes', 'details', 'about'],
  start: ['start date', 'start', 'begins', 'from'],
  end: ['end date', 'end', 'deadline', 'due date', 'due', 'finish', 'to'],
  status: ['status', 'state'],
  tags: ['tags', 'labels', 'tag'],
  color: ['color', 'colour'],
};

const TASK_SYNONYMS: Record<TaskField, string[]> = {
  project: ['project', 'project name'],
  name: ['name', 'task', 'title', 'task name', 'to do', 'todo'],
  description: ['description', 'notes', 'details'],
  date: ['date', 'due date', 'due', 'day', 'when', 'deadline'],
  start: ['start time', 'start', 'from', 'begins'],
  end: ['end time', 'end', 'to', 'until', 'finish'],
  importance: ['importance', 'priority', 'quadrant', 'eisenhower'],
  urgent: ['urgent', 'is urgent'],
  important: ['important', 'is important'],
  type: ['type', 'kind', 'task type'],
  timeMode: ['time mode', 'mode', 'busy', 'blocked'],
  status: ['status', 'state', 'done'],
  repeats: ['repeats', 'repeat', 'recurrence', 'recurring', 'frequency'],
  subtasks: ['subtasks', 'sub tasks', 'checklist', 'steps'],
};

const header = (h: string) => h.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');

export type Mapping<F extends string> = Record<string, F | 'ignore'>;

/**
 * Each column's field, by header and synonyms; a remembered mapping (the
 * person's own last choice for that header) wins. A field is matched once.
 */
export function autoMap<F extends string>(
  headers: string[],
  role: 'projects' | 'tasks',
  remembered: Record<string, string> = {}
): Mapping<F> {
  const synonyms = (role === 'projects' ? PROJECT_SYNONYMS : TASK_SYNONYMS) as Record<string, string[]>;
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const saved = remembered[header(h)];
    if (saved && (saved === 'ignore' || !used.has(saved))) {
      out[h] = saved;
      if (saved !== 'ignore') used.add(saved);
    }
  }
  // Exact synonym first, then the first one a header starts with.
  for (const pass of [0, 1]) {
    for (const h of headers) {
      if (out[h]) continue;
      const key = header(h);
      const hit = Object.entries(synonyms).find(
        ([field, words]) => !used.has(field) && words.some((w) => (pass === 0 ? key === w : key.startsWith(w + ' ') || key.endsWith(' ' + w)))
      );
      if (hit) {
        out[h] = hit[0];
        used.add(hit[0]);
      }
    }
  }
  for (const h of headers) if (!out[h]) out[h] = 'ignore';
  return out as Mapping<F>;
}

/** The mapping in a form worth remembering (by normalized header). */
export function rememberable(mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).map(([h, f]) => [header(h), f]));
}

/** Up to three non-empty sample values of a column. */
export function samples(rows: Record<string, unknown>[], column: string): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const v = cellText(row[column]);
    if (v) out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading values

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value).trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A date cell: a Date (SheetJS), an Excel date number, ISO (2026-10-05),
 * or day first (05/10/2026, 5-10-26) unless `dayFirst` is false.
 * `invalid` when there's text that isn't a date.
 */
export function parseDate(value: unknown, dayFirst = true): { date: string | null; invalid: boolean } {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return { date: null, invalid: true };
    return { date: iso(value.getFullYear(), value.getMonth() + 1, value.getDate()), invalid: false };
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = new Date(EXCEL_EPOCH + Math.floor(value) * 86_400_000);
    return { date: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), invalid: false };
  }
  const text = cellText(value);
  if (!text) return { date: null, invalid: false };
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return checked(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return dayFirst ? checked(year, +m[2], +m[1]) : checked(year, +m[1], +m[2]);
  }
  if (/^\d+(\.\d+)?$/.test(text)) return parseDate(Number(text), dayFirst);
  return { date: null, invalid: true };
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function checked(y: number, m: number, d: number): { date: string | null; invalid: boolean } {
  const date = new Date(y, m - 1, d);
  if (m < 1 || m > 12 || date.getMonth() !== m - 1 || date.getDate() !== d) return { date: null, invalid: true };
  return { date: iso(y, m, d), invalid: false };
}

/** A time cell as minutes after midnight: 14:30, 2:30 pm, 9am, or a fraction of a day. */
export function parseTime(value: unknown): { minutes: number | null; invalid: boolean } {
  if (value instanceof Date) return { minutes: value.getHours() * 60 + value.getMinutes(), invalid: false };
  if (typeof value === 'number' && value >= 0 && value < 1) return { minutes: Math.round(value * 1440), invalid: false };
  const text = cellText(value).toLowerCase().replace(/\s+/g, '');
  if (!text) return { minutes: null, invalid: false };
  const m = text.match(/^(\d{1,2})(?:[:h.](\d{2}))?(am|pm)?$/);
  if (!m) return { minutes: null, invalid: true };
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59 || (!m[2] && !m[3] && h > 23)) return { minutes: null, invalid: true };
  return { minutes: h * 60 + min, invalid: false };
}

const YES = new Set(['yes', 'y', 'true', '1', 'x', 'oui']);

/** The Eisenhower quadrant: from an Importance word, or Urgent and Important yes-no cells. */
export function parseImportance(importance: unknown, urgent?: unknown, important?: unknown): Quadrant | null {
  const t = cellText(importance).toLowerCase();
  if (t) {
    if (/do first|^do$|urgent.*important|q1/.test(t)) return 'do';
    if (/schedule|plan|q2/.test(t)) return 'schedule';
    if (/delegate|q3/.test(t)) return 'delegate';
    if (/eliminate|delete|drop|q4/.test(t)) return 'eliminate';
  }
  const u = cellText(urgent).toLowerCase();
  const i = cellText(important).toLowerCase();
  if (!u && !i) return null;
  const isU = YES.has(u);
  const isI = YES.has(i);
  return isU && isI ? 'do' : isI ? 'schedule' : isU ? 'delegate' : 'eliminate';
}

const DAY_WORDS: Record<string, Weekday> = {
  monday: 'MO', mon: 'MO', tuesday: 'TU', tue: 'TU', tues: 'TU', wednesday: 'WE', wed: 'WE', thursday: 'TH', thu: 'TH', thurs: 'TH',
  friday: 'FR', fri: 'FR', saturday: 'SA', sat: 'SA', sunday: 'SU', sun: 'SU',
};

/** "daily", "weekly on Monday and Thursday", "every 2 weeks", "monthly", "yearly" as an RRULE; `invalid` for anything else. */
export function parseRepeats(value: unknown): { rrule: string | null; invalid: boolean } {
  const t = cellText(value).toLowerCase();
  if (!t || /^(no|none|never|once|-)$/.test(t)) return { rrule: null, invalid: false };
  const every = t.match(/every\s+(\d+)\s+(day|week|month|year)s?/);
  let rule: RecurrenceRule | null = null;
  if (every) rule = { freq: (({ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }) as const)[every[2] as 'day'], interval: +every[1] };
  else if (/daily|every day/.test(t)) rule = { freq: 'DAILY', interval: 1 };
  else if (/weekdays|every weekday/.test(t)) rule = { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
  else if (/weekly|every week|each week/.test(t)) rule = { freq: 'WEEKLY', interval: 1 };
  else if (/monthly|every month/.test(t)) rule = { freq: 'MONTHLY', interval: 1 };
  else if (/yearly|annually|every year/.test(t)) rule = { freq: 'YEARLY', interval: 1 };
  if (!rule) return { rrule: null, invalid: true };
  if (rule.freq === 'WEEKLY') {
    const days = [...new Set(t.split(/[^a-z]+/).map((w) => DAY_WORDS[w]).filter(Boolean))] as Weekday[];
    if (days.length) rule = { ...rule, byDay: WEEKDAYS.filter((d) => days.includes(d)) };
  }
  return { rrule: formatRRule(rule), invalid: false };
}

export function parseSubtasks(value: unknown): string[] {
  return cellText(value)
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseStatus(value: unknown, kind: 'project' | 'task'): string | null {
  const t = cellText(value).toLowerCase();
  if (!t) return null;
  if (kind === 'project') {
    if (/done|complete|finished|closed/.test(t)) return 'Completed';
    if (/archiv/.test(t)) return 'Archived';
    return 'Active';
  }
  if (/done|complete|finished|yes|true/.test(t)) return 'Done';
  if (/stuck|blocked/.test(t)) return 'Stuck';
  if (/review/.test(t)) return 'In Review';
  if (/cancel/.test(t)) return 'Cancelled';
  return 'Pending';
}

export function parseTimeMode(value: unknown): 'blocked' | 'free' | null {
  const t = cellText(value).toLowerCase();
  if (!t) return null;
  if (/free|flex|no/.test(t)) return 'free';
  if (/block|busy|yes|fixed/.test(t)) return 'blocked';
  return null;
}

// ---------------------------------------------------------------------------
// Names and similarity

/** Lowercase, trimmed, single spaces, no punctuation. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name without years and numbers ("Budget 2025" and "Budget 2026" match). */
export function withoutNumbers(name: string): string {
  return normalizeName(name).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 1 = the same, 0 = nothing in common (Levenshtein on the normalized names). */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x.length && !y.length) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (x[i - 1] === y[j - 1] ? 0 : 1));
      last = temp;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

function looksLike(a: string, b: string): boolean {
  if (similarity(a, b) >= 0.9) return true;
  const na = withoutNumbers(a);
  return na.length > 0 && na === withoutNumbers(b);
}

// ---------------------------------------------------------------------------
// Rows, review and duplicates

export interface ProjectDraft {
  name: string;
  area: string;
  description: string;
  start: string | null;
  end: string | null;
  status: string | null;
  tags: string[];
  color: string;
}

export interface TaskDraft {
  project: string;
  name: string;
  description: string;
  date: string | null;
  start: number | null;
  end: number | null;
  quadrant: Quadrant | null;
  type: string;
  timeMode: 'blocked' | 'free' | null;
  status: string | null;
  rrule: string | null;
  subtasks: string[];
}

export type RowStatus = 'new' | 'duplicate' | 'possible' | 'problem';
export type Decision = 'create' | 'skip' | 'update';

export interface ReviewItem {
  key: string;
  kind: 'project' | 'task';
  sheet: string;
  rowNumber: number;
  project?: ProjectDraft;
  task?: TaskDraft;
  /** The normalized project name a task belongs to. */
  projectKey: string;
  status: RowStatus;
  problems: string[];
  /** The existing project or task it matches. */
  match: { id: string; name: string; archived?: boolean; sameFile?: boolean } | null;
  /** What "Update existing" would change. */
  changes: { field: string; from: string; to: string }[];
  decision: Decision;
  /** False for a possible duplicate until the person chooses. */
  decided: boolean;
}

export interface ExistingData {
  projects: { id: string; name: string; archived: boolean; description: string; startDate: string | null; endDate: string | null; areaName: string | null }[];
  tasks: { id: string; projectId: string | null; title: string; date: string | null; notes: string }[];
}

function readProject(row: Record<string, unknown>, map: Mapping<ProjectField>, dayFirst: boolean, problems: string[]): ProjectDraft {
  const col = (f: ProjectField) => Object.keys(map).find((h) => map[h] === f);
  const v = (f: ProjectField) => (col(f) ? row[col(f)!] : '');
  const start = parseDate(v('start'), dayFirst);
  const end = parseDate(v('end'), dayFirst);
  if (start.invalid) problems.push('Unreadable start date');
  if (end.invalid) problems.push('Unreadable end date');
  if (start.date && end.date && end.date < start.date) problems.push('End date is before the start');
  return {
    name: cellText(v('name')),
    area: cellText(v('area')),
    description: cellText(v('description')),
    start: start.date,
    end: end.date,
    status: parseStatus(v('status'), 'project'),
    tags: cellText(v('tags'))
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean),
    color: cellText(v('color')),
  };
}

function readTask(row: Record<string, unknown>, map: Mapping<TaskField>, dayFirst: boolean, problems: string[], fallbackProject: string): TaskDraft {
  const col = (f: TaskField) => Object.keys(map).find((h) => map[h] === f);
  const v = (f: TaskField) => (col(f) ? row[col(f)!] : '');
  const date = parseDate(v('date'), dayFirst);
  const start = parseTime(v('start'));
  const end = parseTime(v('end'));
  const repeats = parseRepeats(v('repeats'));
  if (date.invalid) problems.push('Unreadable date');
  if (start.invalid) problems.push('Unreadable start time');
  if (end.invalid) problems.push('Unreadable end time');
  if (start.minutes !== null && end.minutes !== null && end.minutes <= start.minutes) problems.push('End time is before the start');
  if ((start.minutes !== null || end.minutes !== null) && !date.date && !date.invalid) problems.push('A time needs a date');
  if (repeats.invalid) problems.push('Repeats not understood');
  return {
    project: cellText(v('project')) || fallbackProject,
    name: cellText(v('name')),
    description: cellText(v('description')),
    date: date.date,
    start: start.minutes,
    end: end.minutes,
    quadrant: parseImportance(v('importance'), v('urgent'), v('important')),
    type: cellText(v('type')) || 'ToDo',
    timeMode: parseTimeMode(v('timeMode')),
    status: parseStatus(v('status'), 'task'),
    rrule: repeats.rrule,
    subtasks: parseSubtasks(v('subtasks')),
  };
}

const show = (v: string | null | undefined) => (v ? v : 'empty');

/**
 * Every row of the file, read, checked and matched: New, Duplicate (exact,
 * skipped by default), Possible duplicate (a choice to make) or Problem.
 * `contextProject` is the project "Import tasks" was opened from.
 */
export function buildReview(input: {
  projectRows: { sheet: string; rows: Record<string, unknown>[]; mapping: Mapping<ProjectField> } | null;
  taskRows: { sheet: string; rows: Record<string, unknown>[]; mapping: Mapping<TaskField> } | null;
  existing: ExistingData;
  dayFirst?: boolean;
  contextProject?: { id: string; name: string } | null;
}): ReviewItem[] {
  const { existing, dayFirst = true, contextProject = null } = input;
  const items: ReviewItem[] = [];
  const projectsByNorm = new Map(existing.projects.map((p) => [normalizeName(p.name), p]));

  // Projects named in the file: their own rows, plus any a task names.
  const fileProjects = new Map<string, ReviewItem>();
  input.projectRows?.rows.forEach((row, i) => {
    const problems: string[] = [];
    const draft = readProject(row, input.projectRows!.mapping, dayFirst, problems);
    if (!draft.name && !Object.values(row).some((x) => cellText(x))) return;
    if (!draft.name) problems.push('Missing name');
    const key = normalizeName(draft.name);
    const item: ReviewItem = {
      key: `p:${input.projectRows!.sheet}:${i + 2}`,
      kind: 'project',
      sheet: input.projectRows!.sheet,
      rowNumber: i + 2,
      project: draft,
      projectKey: key,
      status: 'new',
      problems,
      match: null,
      changes: [],
      decision: 'create',
      decided: true,
    };
    const twin = fileProjects.get(key);
    if (draft.name && twin) {
      item.status = 'duplicate';
      item.match = { id: twin.key, name: twin.project!.name, sameFile: true };
    } else if (draft.name) {
      matchProject(item, projectsByNorm.get(key) ?? null, existing);
      fileProjects.set(key, item);
    }
    items.push(item);
  });

  // Tasks.
  const seenTasks = new Map<string, ReviewItem>();
  input.taskRows?.rows.forEach((row, i) => {
    const problems: string[] = [];
    const draft = readTask(row, input.taskRows!.mapping, dayFirst, problems, contextProject?.name ?? '');
    if (!draft.name && !Object.values(row).some((x) => cellText(x))) return;
    if (!draft.name) problems.push('Missing name');
    if (!draft.project) problems.push('Missing project');
    const projectKey = normalizeName(draft.project);
    const item: ReviewItem = {
      key: `t:${input.taskRows!.sheet}:${i + 2}`,
      kind: 'task',
      sheet: input.taskRows!.sheet,
      rowNumber: i + 2,
      task: draft,
      projectKey,
      status: 'new',
      problems,
      match: null,
      changes: [],
      decision: 'create',
      decided: true,
    };
    const fileKey = `${projectKey}|${normalizeName(draft.name)}|${draft.date ?? ''}`;
    const twin = seenTasks.get(fileKey);
    if (draft.name && twin) {
      item.status = 'duplicate';
      item.match = { id: twin.key, name: twin.task!.name, sameFile: true };
    } else if (draft.name) {
      seenTasks.set(fileKey, item);
      // A project only the tasks name: created with them (or matched).
      if (projectKey && !fileProjects.has(projectKey) && !(contextProject && normalizeName(contextProject.name) === projectKey)) {
        const p: ReviewItem = {
          key: `p:implied:${projectKey}`,
          kind: 'project',
          sheet: input.taskRows!.sheet,
          rowNumber: i + 2,
          project: { name: draft.project, area: '', description: '', start: null, end: null, status: null, tags: [], color: '' },
          projectKey,
          status: 'new',
          problems: [],
          match: null,
          changes: [],
          decision: 'create',
          decided: true,
        };
        matchProject(p, projectsByNorm.get(projectKey) ?? null, existing);
        // Naming an existing project by its exact name just files the tasks there.
        if (p.status === 'duplicate') p.decision = 'skip';
        fileProjects.set(projectKey, p);
        items.push(p);
      }
      const projectId =
        contextProject && normalizeName(contextProject.name) === projectKey ? contextProject.id : (projectsByNorm.get(projectKey)?.id ?? null);
      matchTask(item, projectId, existing);
    }
    items.push(item);
  });

  for (const item of items) {
    if (item.problems.length) item.status = 'problem';
    // Duplicates are skipped by default; a possible duplicate waits for a
    // choice; a problem waits to be fixed or skipped.
    if (item.status === 'duplicate') item.decision = 'skip';
    else if (item.status === 'problem') item.decision = 'skip';
    else if (item.status === 'possible') {
      item.decision = 'skip';
      item.decided = false;
    } else item.decision = 'create';
    if (item.status === 'problem') item.decided = false;
  }
  return items;
}

function matchProject(item: ReviewItem, exact: ExistingData['projects'][number] | null, existing: ExistingData) {
  const draft = item.project!;
  const hit = exact ?? null;
  if (hit) {
    item.status = 'duplicate';
    item.match = { id: hit.id, name: hit.name, archived: hit.archived };
    item.changes = projectChanges(hit, draft);
    return;
  }
  const near = existing.projects.find((p) => looksLike(p.name, draft.name));
  if (near) {
    item.status = 'possible';
    item.match = { id: near.id, name: near.name, archived: near.archived };
    item.changes = projectChanges(near, draft);
  }
}

function projectChanges(p: ExistingData['projects'][number], d: ProjectDraft) {
  const out: ReviewItem['changes'] = [];
  if (d.description && d.description !== p.description) out.push({ field: 'Description', from: show(p.description), to: d.description });
  if (d.start && d.start !== p.startDate) out.push({ field: 'Start date', from: show(p.startDate), to: d.start });
  if (d.end && d.end !== p.endDate) out.push({ field: 'End date', from: show(p.endDate), to: d.end });
  if (p.archived) out.push({ field: 'Status', from: 'Archived', to: 'Active' });
  return out;
}

function matchTask(item: ReviewItem, projectId: string | null, existing: ExistingData) {
  const d = item.task!;
  if (!projectId) return;
  const same = existing.tasks.filter((t) => t.projectId === projectId);
  const n = normalizeName(d.name);
  const exact = same.find((t) => normalizeName(t.title) === n && (t.date ?? null) === (d.date ?? null));
  if (exact) {
    item.status = 'duplicate';
    item.match = { id: exact.id, name: exact.title };
    if (d.description && d.description !== exact.notes) item.changes = [{ field: 'Description', from: show(exact.notes), to: d.description }];
    return;
  }
  const near =
    same.find((t) => normalizeName(t.title) === n) ?? same.find((t) => (t.date ?? null) === (d.date ?? null) && similarity(t.title, d.name) >= 0.9);
  if (near) {
    item.status = 'possible';
    item.match = { id: near.id, name: near.title };
    item.changes = [
      ...(near.date !== d.date ? [{ field: 'Date', from: show(near.date), to: show(d.date) }] : []),
      ...(d.description && d.description !== near.notes ? [{ field: 'Description', from: show(near.notes), to: d.description }] : []),
    ];
  }
}

export interface ImportSummary {
  newProjects: number;
  updatedProjects: number;
  newTasks: number;
  updatedTasks: number;
  skippedDuplicates: number;
  needAttention: number;
}

/** The counts the Confirm step shows; Import waits while needAttention > 0. */
export function summarize(items: ReviewItem[]): ImportSummary {
  const s: ImportSummary = { newProjects: 0, updatedProjects: 0, newTasks: 0, updatedTasks: 0, skippedDuplicates: 0, needAttention: 0 };
  for (const i of items) {
    if (!i.decided) s.needAttention++;
    if (i.decision === 'create') {
      if (i.kind === 'project') s.newProjects++;
      else s.newTasks++;
    } else if (i.decision === 'update') {
      if (i.kind === 'project') s.updatedProjects++;
      else s.updatedTasks++;
    }
    else if (i.status === 'duplicate' && !i.key.startsWith('p:implied:')) s.skippedDuplicates++;
  }
  return s;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 new projects, 1 updated, 42 new tasks, 5 skipped as duplicates, 2 need attention" */
export function summaryText(s: ImportSummary): string {
  const parts = [
    s.newProjects ? plural(s.newProjects, 'new project', 'new projects') : null,
    s.updatedProjects + s.updatedTasks ? `${s.updatedProjects + s.updatedTasks} updated` : null,
    s.newTasks ? plural(s.newTasks, 'new task', 'new tasks') : null,
    s.skippedDuplicates ? `${s.skippedDuplicates} skipped as duplicates` : null,
    s.needAttention ? `${s.needAttention} ${s.needAttention === 1 ? 'needs' : 'need'} attention` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Nothing to import';
}
