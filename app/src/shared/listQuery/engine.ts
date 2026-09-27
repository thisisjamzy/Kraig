// List queries — the Notion-style filter and sort engine behind the
// projects, tasks and transactions lists (src/widgets/ListQuery for the UI).
// Pure: a list describes its fields once (FieldDef), and a ListQuery (simple
// filters AND-ed together, an optional advanced rule group, sorts in
// priority order, and a search) is applied to its items.
//
// Rules of the road:
//   - A rule with no value yet filters nothing (its chip shows dashed).
//   - A rule on a field or option that no longer exists is "missing": it
//     filters nothing and its chip shows red.
//   - Select fields sort by their options' order (a rank — e.g. a task's
//     importance: do first, schedule, delegate, eliminate), not A to Z.
//   - Empty values sort last in both directions.
//   - Dates compare by local day; presets resolve against "now".

export type FieldType = 'text' | 'number' | 'currency' | 'date' | 'time' | 'select' | 'checkbox';

export interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

export type FieldValue = string | number | Date | boolean | null | undefined | string[];

export interface FieldDef<T> {
  id: string;
  label: string;
  type: FieldType;
  get: (item: T) => FieldValue;
  /** Select fields: every option, in rank order (sorting follows it). */
  options?: FieldOption[];
  /** Searched by the toolbar's search box. */
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
}

export type Operator =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'starts_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'between'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'within'
  | 'any_of'
  | 'none_of'
  | 'checked'
  | 'unchecked';

export type DatePreset =
  | 'today'
  | 'tomorrow'
  | 'yesterday'
  | 'this_week'
  | 'next_week'
  | 'this_month'
  | 'last_30_days'
  | 'next_7_days'
  | 'overdue';

export type DateValue = { preset: DatePreset } | { date: string } | { from: string; to: string };

export interface Rule {
  id: string;
  kind: 'rule';
  field: string;
  op: Operator;
  /** text: string · number: number | [min, max] · date: DateValue · select: string[] */
  value: unknown;
}

export interface Group {
  id: string;
  kind: 'group';
  conj: 'and' | 'or';
  rules: (Rule | Group)[];
}

export interface Sort {
  id: string;
  field: string;
  dir: 'asc' | 'desc';
}

export interface ListQuery {
  filters: Rule[];
  advanced: Group | null;
  sorts: Sort[];
  search: string;
}

export const EMPTY_QUERY: ListQuery = { filters: [], advanced: null, sorts: [], search: '' };

// ---------------------------------------------------------------------------
// Operators and labels

export const OPERATORS: Record<FieldType, Operator[]> = {
  text: ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'is_empty', 'is_not_empty'],
  number: ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'between', 'is_empty'],
  currency: ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'between', 'is_empty'],
  time: ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'between', 'is_empty'],
  date: ['is', 'before', 'after', 'on_or_before', 'on_or_after', 'within', 'is_empty'],
  select: ['is', 'is_not', 'any_of', 'none_of', 'is_empty'],
  checkbox: ['checked', 'unchecked'],
};

export const OPERATOR_LABEL: Record<Operator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  is: 'is',
  is_not: 'is not',
  starts_with: 'starts with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  eq: '=',
  ne: '≠',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  between: 'between',
  before: 'is before',
  after: 'is after',
  on_or_before: 'is on or before',
  on_or_after: 'is on or after',
  within: 'is within',
  any_of: 'is any of',
  none_of: 'is none of',
  checked: 'is checked',
  unchecked: 'is not checked',
};

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_week', label: 'Next week' },
  { id: 'next_7_days', label: 'Next 7 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'overdue', label: 'Overdue' },
];

/** Operators that take no value. */
export function valueless(op: Operator): boolean {
  return op === 'is_empty' || op === 'is_not_empty' || op === 'checked' || op === 'unchecked';
}

/** "Oldest first / Newest first", "A to Z / Z to A", "Low to high / High to low". */
export function directionLabels(field: Pick<FieldDef<unknown>, 'type'>): { asc: string; desc: string } {
  switch (field.type) {
    case 'date':
      return { asc: 'Oldest first', desc: 'Newest first' };
    case 'text':
      return { asc: 'A to Z', desc: 'Z to A' };
    case 'number':
    case 'currency':
    case 'time':
      return { asc: 'Low to high', desc: 'High to low' };
    case 'checkbox':
      return { asc: 'Unchecked first', desc: 'Checked first' };
    default:
      return { asc: 'Ascending', desc: 'Descending' };
  }
}

export function defaultOperator(type: FieldType): Operator {
  if (type === 'select') return 'any_of';
  if (type === 'checkbox') return 'checked';
  if (type === 'date') return 'within';
  if (type === 'text') return 'contains';
  return 'gte';
}

// ---------------------------------------------------------------------------
// Dates

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A date value as an inclusive [start, end] window. */
export function dateRange(value: DateValue, now: Date): [Date, Date] {
  if ('preset' in value) {
    const today = startOfDay(now);
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    switch (value.preset) {
      case 'today':
        return [today, endOfDay(today)];
      case 'tomorrow':
        return [addDays(today, 1), endOfDay(addDays(today, 1))];
      case 'yesterday':
        return [addDays(today, -1), endOfDay(addDays(today, -1))];
      case 'this_week':
        return [monday, endOfDay(addDays(monday, 6))];
      case 'next_week':
        return [addDays(monday, 7), endOfDay(addDays(monday, 13))];
      case 'next_7_days':
        return [today, endOfDay(addDays(today, 6))];
      case 'this_month':
        return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
      case 'last_30_days':
        return [addDays(today, -29), endOfDay(today)];
      case 'overdue':
        return [new Date(0), new Date(now.getTime() - 1)];
    }
  }
  if ('date' in value) return [parseDay(value.date), endOfDay(parseDay(value.date))];
  const a = parseDay(value.from);
  const b = parseDay(value.to);
  return a <= b ? [a, endOfDay(b)] : [b, endOfDay(a)];
}

// ---------------------------------------------------------------------------
// Evaluating rules

function isEmptyValue(v: FieldValue): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/** A rule's value is set (enough to filter by). */
export function hasValue(rule: Rule): boolean {
  if (valueless(rule.op)) return true;
  const v = rule.value;
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => x !== null && x !== undefined && x !== '');
  return true;
}

/** A rule on a field — or select option — that no longer exists. */
export function isMissing<T>(rule: Rule, fields: FieldDef<T>[]): boolean {
  const field = fields.find((f) => f.id === rule.field);
  if (!field) return true;
  if (field.type === 'select' && Array.isArray(rule.value) && field.options) {
    const known = new Set(field.options.map((o) => o.value));
    return (rule.value as string[]).some((v) => !known.has(v));
  }
  return false;
}

function asNumber(v: FieldValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  return null;
}

export function evaluateRule<T>(item: T, rule: Rule, fields: FieldDef<T>[], now: Date): boolean {
  const field = fields.find((f) => f.id === rule.field);
  if (!field || !hasValue(rule) || isMissing(rule, fields)) return true;
  const raw = field.get(item);
  if (rule.op === 'is_empty') return isEmptyValue(raw);
  if (rule.op === 'is_not_empty') return !isEmptyValue(raw);

  switch (field.type) {
    case 'text': {
      const text = String(raw ?? '').toLowerCase();
      const q = String(rule.value).toLowerCase();
      if (rule.op === 'contains') return text.includes(q);
      if (rule.op === 'not_contains') return !text.includes(q);
      if (rule.op === 'is') return text === q;
      if (rule.op === 'is_not') return text !== q;
      if (rule.op === 'starts_with') return text.startsWith(q);
      return true;
    }
    case 'number':
    case 'currency':
    case 'time': {
      const n = asNumber(raw);
      if (n === null) return false;
      if (rule.op === 'between') {
        const [a, b] = rule.value as [number, number];
        return n >= Math.min(a, b) && n <= Math.max(a, b);
      }
      const x = Number(rule.value);
      if (rule.op === 'eq') return n === x;
      if (rule.op === 'ne') return n !== x;
      if (rule.op === 'gt') return n > x;
      if (rule.op === 'lt') return n < x;
      if (rule.op === 'gte') return n >= x;
      if (rule.op === 'lte') return n <= x;
      return true;
    }
    case 'date': {
      if (!(raw instanceof Date)) return false;
      const [start, end] = dateRange(rule.value as DateValue, now);
      const t = raw.getTime();
      if (rule.op === 'is' || rule.op === 'within') return t >= start.getTime() && t <= end.getTime();
      if (rule.op === 'before') return t < start.getTime();
      if (rule.op === 'after') return t > end.getTime();
      if (rule.op === 'on_or_before') return t <= end.getTime();
      if (rule.op === 'on_or_after') return t >= start.getTime();
      return true;
    }
    case 'select': {
      const values = Array.isArray(raw) ? raw : isEmptyValue(raw) ? [] : [String(raw)];
      const chosen = rule.value as string[];
      const hit = values.some((v) => chosen.includes(v));
      if (rule.op === 'is' || rule.op === 'any_of') return hit;
      if (rule.op === 'is_not' || rule.op === 'none_of') return !hit;
      return true;
    }
    case 'checkbox':
      return rule.op === 'checked' ? raw === true : raw !== true;
  }
}

export function evaluateGroup<T>(item: T, group: Group, fields: FieldDef<T>[], now: Date): boolean {
  const results = group.rules
    .filter((r) => r.kind === 'group' || (hasValue(r) && !isMissing(r, fields)))
    .map((r) => (r.kind === 'group' ? evaluateGroup(item, r, fields, now) : evaluateRule(item, r, fields, now)));
  if (!results.length) return true;
  return group.conj === 'and' ? results.every(Boolean) : results.some(Boolean);
}

// ---------------------------------------------------------------------------
// Sorting

function compareValues(a: FieldValue, b: FieldValue, field: FieldDef<unknown>): number {
  if (field.type === 'select') {
    const rank = (v: FieldValue) => {
      const value = Array.isArray(v) ? v[0] : v;
      const i = field.options?.findIndex((o) => o.value === value) ?? -1;
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return rank(a) - rank(b);
  }
  if (field.type === 'text') return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  if (field.type === 'checkbox') return Number(a === true) - Number(b === true);
  return (asNumber(a) ?? 0) - (asNumber(b) ?? 0);
}

export function sortItems<T>(items: T[], sorts: Sort[], fields: FieldDef<T>[]): T[] {
  const active = sorts
    .map((s) => ({ s, field: fields.find((f) => f.id === s.field) }))
    .filter((x): x is { s: Sort; field: FieldDef<T> } => Boolean(x.field));
  if (!active.length) return items;
  return items
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      for (const { s, field } of active) {
        const a = field.get(x.item);
        const b = field.get(y.item);
        const ea = isEmptyValue(a);
        const eb = isEmptyValue(b);
        // Empty values last, whichever the direction.
        if (ea || eb) {
          if (ea && eb) continue;
          return ea ? 1 : -1;
        }
        const c = compareValues(a, b, field as FieldDef<unknown>);
        if (c !== 0) return s.dir === 'asc' ? c : -c;
      }
      return x.index - y.index;
    })
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------
// The whole query

export function applyQuery<T>(items: T[], query: ListQuery, fields: FieldDef<T>[], now: Date): T[] {
  const q = query.search.trim().toLowerCase();
  const searchable = fields.filter((f) => f.searchable);
  const kept = items.filter((item) => {
    if (!query.filters.every((rule) => evaluateRule(item, rule, fields, now))) return false;
    if (query.advanced && !evaluateGroup(item, query.advanced, fields, now)) return false;
    if (q && !searchable.some((f) => String(f.get(item) ?? '').toLowerCase().includes(q))) return false;
    return true;
  });
  return sortItems(kept, query.sorts, fields);
}

/** How many rules an advanced group holds (its chip: "3 rules"). */
export function countRules(group: Group | null): number {
  if (!group) return 0;
  return group.rules.reduce((n, r) => n + (r.kind === 'group' ? countRules(r) : 1), 0);
}

/** Filter count for the toolbar badge (an advanced filter counts once). */
export function filterCount(query: ListQuery): number {
  return query.filters.length + (query.advanced && countRules(query.advanced) > 0 ? 1 : 0);
}

let seq = 0;
export function newId(prefix = 'r'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

// ---------------------------------------------------------------------------
// Persistence — a query as plain JSON and back (dates stay YYYY-MM-DD).

export function serialize(query: ListQuery): string {
  return JSON.stringify(query);
}

export function deserialize(json: string | null | undefined): ListQuery | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<ListQuery>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      filters: Array.isArray(parsed.filters) ? parsed.filters : [],
      advanced: parsed.advanced && parsed.advanced.kind === 'group' ? parsed.advanced : null,
      sorts: Array.isArray(parsed.sorts) ? parsed.sorts : [],
      search: typeof parsed.search === 'string' ? parsed.search : '',
    };
  } catch {
    return null;
  }
}
