// What both spreadsheet imports (Time and Money) share: a review item per
// row (or per name a row points to), its status, the person's choice, and
// the counts and sentence the Confirm step shows. Pure; tested in
// test/importTemplates.test.ts.
//
// Statuses
//   new        created by the import
//   linked     a name a row points to that already exists: nothing is
//              created, the rows are filed under it
//   duplicate  already exists (or repeats an earlier row of the file):
//              skipped unless the person chooses Update existing (or, for
//              tasks and basket items, Create anyway)
//   problem    can't be imported as it is: fixed or skipped first

import { nameKey } from './names';

export type ItemKind = 'area' | 'section' | 'project' | 'task' | 'wallet' | 'income' | 'basket' | 'basketItem';
export type RowStatus = 'new' | 'linked' | 'duplicate' | 'problem';
export type Decision = 'create' | 'skip' | 'update';

export interface Change {
  field: string;
  from: string;
  to: string;
}

export interface ReviewItem<V = Record<string, unknown>> {
  key: string;
  kind: ItemKind;
  sheet: string;
  /** The spreadsheet row (2 is the first under the header); null for a name only other rows point to. */
  rowNumber: number | null;
  name: string;
  /** What it's grouped under in the review: its project, area or basket. */
  group: string;
  values: V;
  /** The row in plain words ("Every week on Tue and Thu, 06:00 to 07:00, 20 times, blocked"). */
  text: string;
  status: RowStatus;
  problems: string[];
  /** Things worth knowing that don't stop the import. */
  notes: string[];
  match: { id: string; name: string; archived?: boolean; sameFile?: boolean } | null;
  /** What Update existing would change, field by field. */
  changes: Change[];
  decision: Decision;
  /** False while a choice is still needed (a problem, or a conflict). */
  decided: boolean;
  /** Tasks and basket items can be created next to one with the same name. */
  canCreateAnyway: boolean;
  repeating?: boolean;
}

export const KIND_WORDS: Record<ItemKind, [string, string]> = {
  area: ['area', 'areas'],
  section: ['section', 'sections'],
  project: ['project', 'projects'],
  task: ['task', 'tasks'],
  wallet: ['wallet', 'wallets'],
  income: ['income source', 'income sources'],
  basket: ['basket', 'baskets'],
  basketItem: ['basket item', 'basket items'],
};

export const STATUS_LABEL: Record<RowStatus, string> = { new: 'New', linked: 'Linked to existing', duplicate: 'Duplicate', problem: 'Problem' };

/** Default choices: new is created, linked needs nothing, duplicates are skipped, problems wait. */
export function settle<T extends ReviewItem<unknown>>(items: T[]): T[] {
  for (const item of items) {
    if (item.problems.length) item.status = 'problem';
    item.decision = item.status === 'new' ? 'create' : 'skip';
    item.decided = item.status !== 'problem';
  }
  return items;
}

/** Same-file and existing lookups by name. */
export function byName<T extends { name: string }>(list: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const x of list) if (!out.has(nameKey(x.name))) out.set(nameKey(x.name), x);
  return out;
}

export interface ImportSummary {
  created: Partial<Record<ItemKind, number>>;
  linked: Partial<Record<ItemKind, number>>;
  repeating: number;
  updated: number;
  skippedDuplicates: number;
  skippedOther: number;
  needAttention: number;
}

const ORDER: ItemKind[] = ['area', 'section', 'project', 'task', 'wallet', 'income', 'basket', 'basketItem'];

/** The counts the Confirm step shows; Import waits while needAttention > 0. */
export function summarize(items: Pick<ReviewItem<unknown>, 'kind' | 'status' | 'decision' | 'decided' | 'repeating'>[]): ImportSummary {
  const s: ImportSummary = { created: {}, linked: {}, repeating: 0, updated: 0, skippedDuplicates: 0, skippedOther: 0, needAttention: 0 };
  for (const i of items) {
    if (!i.decided) s.needAttention++;
    if (i.status === 'linked') s.linked[i.kind] = (s.linked[i.kind] ?? 0) + 1;
    else if (i.decision === 'create') {
      s.created[i.kind] = (s.created[i.kind] ?? 0) + 1;
      if (i.kind === 'task' && i.repeating) s.repeating++;
    } else if (i.decision === 'update') s.updated++;
    else if (i.status === 'duplicate') s.skippedDuplicates++;
    else if (i.decided) s.skippedOther++;
  }
  return s;
}

const count = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/** "1 new area, 2 projects linked to existing, 3 new projects, 48 new tasks including 6 repeating, 5 duplicates skipped, 2 updated" */
export function summaryText(s: ImportSummary): string {
  const parts: string[] = [];
  for (const kind of ORDER) {
    const [one, many] = KIND_WORDS[kind];
    const linked = s.linked[kind] ?? 0;
    const created = s.created[kind] ?? 0;
    if (linked) parts.push(`${count(linked, [one, many])} linked to existing`);
    if (created) parts.push(`${count(created, [`new ${one}`, `new ${many}`])}${kind === 'task' && s.repeating ? ` including ${s.repeating} repeating` : ''}`);
  }
  if (s.skippedDuplicates) parts.push(`${count(s.skippedDuplicates, ['duplicate', 'duplicates'])} skipped`);
  if (s.skippedOther) parts.push(`${count(s.skippedOther, ['other row', 'other rows'])} skipped`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.needAttention) parts.push(`${s.needAttention} ${s.needAttention === 1 ? 'needs' : 'need'} attention`);
  return parts.length ? parts.join(', ') : 'Nothing to import';
}

/** "2 new areas will be created: Learning, Fitness" for each kind the import creates from names alone. */
export function impliedText(items: Pick<ReviewItem<unknown>, 'kind' | 'rowNumber' | 'decision' | 'name'>[]): string[] {
  const out: string[] = [];
  for (const kind of ORDER) {
    const names = items.filter((i) => i.kind === kind && i.rowNumber === null && i.decision === 'create').map((i) => i.name);
    if (names.length) out.push(`${count(names.length, [`new ${KIND_WORDS[kind][0]}`, `new ${KIND_WORDS[kind][1]}`])} will be created: ${names.join(', ')}`);
  }
  return out;
}

// ---- Reading a row ----

export type Row = Record<string, unknown>;
/** Header to column key (or 'ignore'). */
export type Mapping = Record<string, string>;

/** The cell a column key maps to in this row ('' when the column isn't there). */
export function cell(row: Row, mapping: Mapping, key: string): unknown {
  for (const h in mapping) if (mapping[h] === key) return row[h];
  return '';
}

/** A row marked Example (the template's first row) or with nothing in it. */
export function skippedRow(row: Row, mapping: Mapping): boolean {
  const type = String(cell(row, mapping, 'rowType') ?? '').trim().toLowerCase();
  if (type === 'example') return true;
  return !Object.entries(row).some(([h, v]) => mapping[h] !== 'rowType' && String(v ?? '').trim() !== '');
}

export const YES_WORDS = new Set(['yes', 'y', 'true', '1', 'x', 'oui']);
export const NO_WORDS = new Set(['no', 'n', 'false', '0', 'non']);

/** Yes, No or empty (null); anything else is a problem. */
export function yesNo(value: unknown, field: string, problems: string[]): boolean | null {
  const t = String(value ?? '').trim().toLowerCase();
  if (!t) return null;
  if (YES_WORDS.has(t)) return true;
  if (NO_WORDS.has(t)) return false;
  problems.push(`${field} must be Yes or No, not "${String(value).trim()}"`);
  return null;
}

/** One of the fixed options (ignoring capitals), or a problem. */
export function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, problems: string[]): T | null {
  const t = nameKey(value);
  if (!t) return null;
  const hit = options.find((o) => nameKey(o) === t);
  if (!hit) problems.push(`${field} must be ${options.slice(0, -1).join(', ')} or ${options[options.length - 1]}, not "${String(value).trim()}"`);
  return hit ?? null;
}

/** A number cell ("150,000" and "150 000" read as 150000), or a problem. */
export function amount(value: unknown, field: string, problems: string[]): number | null {
  if (typeof value === 'number') return value;
  const t = String(value ?? '').trim().replace(/[\s,]/g, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) {
    problems.push(`${field} is not a number: "${String(value).trim()}"`);
    return null;
  }
  return n;
}

export const show = (v: unknown) => {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return 'empty';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

/** A change when the file says something and it differs from what's there. */
export function diff(out: Change[], field: string, from: unknown, to: unknown) {
  if (to === null || to === undefined || to === '' || (Array.isArray(to) && !to.length)) return;
  if (show(from) === show(to)) return;
  out.push({ field, from: show(from), to: show(to) });
}
