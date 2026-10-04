// Planning the next months: budget lines placed in month columns (plus
// "Unscheduled"), and a DRAFT of changes on top — moves between months,
// new amounts, splits across months, drops and a different paying
// account. Nothing is saved to the budget until the draft is applied; the
// draft itself is kept so it survives reloads. Every figure the page shows
// is computed from the draft when there is one. Pure; tested in
// test/planForecast.test.ts.

import type { Need, Priority } from './model';

export interface PlanLine {
  /** itemId@yyyy-MM, or itemId@unscheduled. */
  key: string;
  itemId: string;
  bucketId: string;
  bucketName: string;
  name: string;
  kind: 'fixed' | 'variable' | 'savings';
  need: Need;
  priority: Priority;
  /** yyyy-MM, or null when unscheduled. */
  month: string | null;
  due: Date | null;
  /** What's still to pay on it. */
  amount: number;
  accountId: string | null;
  recurring: boolean;
  /** Prepared when this income line arrives (its automation trigger). */
  incomeItemId: string | null;
  /** The draft changed it. */
  changed?: boolean;
  warnings?: string[];
  /** yyyy-MM: the month it was in before the draft moved it. */
  movedFrom?: string | null;
  /** Suggested by Auto-allocate (not yet accepted), and why. */
  suggested?: { reason: string } | null;
  // Plan fields (all optional, see FirestoreBucketLineItem):
  /** yyyy-MM: not before this month. */
  notBefore?: string | null;
  /** yyyy-MM: needed by this month. */
  neededBy?: string | null;
  splittable?: boolean;
  /** False for a fixed recurring line: it can't be dragged. */
  movable?: boolean;
  splitGroupId?: string | null;
  source?: 'budget_line' | 'plan_item' | 'want_to_buy';
  /** When it started waiting (backlog "Waiting 23 days"). */
  waitingSince?: Date | null;
  /** Fully paid (the "Paid" group). */
  paid?: boolean;
}

export interface IncomeLine {
  key: string;
  itemId: string;
  name: string;
  month: string;
  amount: number;
}

export type PlanChange =
  | { type: 'move'; key: string; toMonth: string | null; scope?: 'month' | 'future'; date?: string | null }
  | { type: 'amount'; key: string; amount: number; scope?: 'month' | 'future' }
  | { type: 'drop'; key: string }
  | { type: 'split'; key: string; parts: { month: string; amount: number }[] }
  | { type: 'account'; key: string; accountId: string }
  | { type: 'priority'; key: string; need?: 'must' | 'nice'; priority?: 'High' | 'Medium' | 'Low' };

export const UNSCHEDULED = 'unscheduled';

/** The same day of the month in another month (the last day when it's shorter). */
export function dueIn(month: string, due: Date | null): Date {
  const [y, m] = month.split('-').map(Number);
  const day = due?.getDate() ?? 1;
  return new Date(y, m - 1, Math.min(day, new Date(y, m, 0).getDate()));
}

/**
 * Can this line move to that month? A line prepared when an income arrives
 * can't move before the first month that income comes in.
 */
export function moveBlocked(line: PlanLine, toMonth: string | null, income: IncomeLine[]): string | null {
  if (!toMonth || !line.incomeItemId) return null;
  const months = income.filter((i) => i.itemId === line.incomeItemId).map((i) => i.month).sort();
  if (!months.length) return null;
  if (toMonth < months[0]) {
    const name = income.find((i) => i.itemId === line.incomeItemId)?.name ?? 'its income';
    return `${line.name} is paid when ${name} arrives, which isn't expected before ${months[0]}.`;
  }
  return null;
}

/** The lines with the draft applied, each marked when it changed. */
export function applyDraft(lines: PlanLine[], changes: PlanChange[]): PlanLine[] {
  let out: PlanLine[] = lines.map((l) => ({ ...l, warnings: [] }));
  for (const change of changes) {
    const index = out.findIndex((l) => l.key === change.key);
    if (index < 0) continue;
    const line = out[index];
    switch (change.type) {
      case 'move': {
        const due = change.toMonth ? (change.date ? new Date(`${change.date}T00:00:00`) : dueIn(change.toMonth, line.due)) : null;
        const moved: PlanLine = { ...line, month: change.toMonth, due, changed: true, movedFrom: line.movedFrom ?? line.month };
        if (line.need === 'must' && change.toMonth !== line.month) moved.warnings = [...(line.warnings ?? []), 'must have moved'];
        out[index] = moved;
        break;
      }
      case 'amount':
        out[index] = { ...line, amount: Math.max(0, change.amount), changed: true };
        break;
      case 'drop':
        out = out.filter((_, i) => i !== index);
        break;
      case 'account':
        out[index] = { ...line, accountId: change.accountId, changed: true };
        break;
      case 'priority':
        out[index] = { ...line, need: change.need ?? line.need, priority: change.priority ?? line.priority, changed: true };
        break;
      case 'split': {
        const [first, ...rest] = change.parts;
        if (!first) break;
        const count = change.parts.length;
        const name = (i: number) => `${line.name}, ${i + 1} of ${count}`;
        out[index] = { ...line, name: name(0), month: first.month, due: dueIn(first.month, line.due), amount: first.amount, changed: true, movedFrom: line.movedFrom ?? line.month };
        rest.forEach((part, i) => {
          out.push({ ...line, key: `${line.key}#${part.month}`, name: name(i + 1), month: part.month, due: dueIn(part.month, line.due), amount: part.amount, changed: true, warnings: [], movedFrom: null });
        });
        break;
      }
    }
  }
  return out;
}

/** Adds a change, replacing an earlier one of the same kind for the same line. */
export function addChange(changes: PlanChange[], change: PlanChange): PlanChange[] {
  const same = (c: PlanChange) => c.key === change.key && (c.type === change.type || (change.type === 'drop' && c.type !== 'account') || (change.type === 'split' && c.type === 'move') || (change.type === 'move' && c.type === 'split'));
  return [...changes.filter((c) => !same(c)), change];
}

export interface MonthColumn {
  month: string;
  expectedIncome: number;
  plannedOut: number;
  left: number;
  /** Daily amount for variable spending in that month. */
  daily: number;
  lines: PlanLine[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Column figures for each month in the horizon (days counted from today in the current month). */
export function monthColumns(months: string[], lines: PlanLine[], income: IncomeLine[], today: Date, incomeFactor = 1): MonthColumn[] {
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return months.map((month) => {
    const inMonth = lines.filter((l) => l.month === month);
    const expectedIncome = r2(income.filter((i) => i.month === month).reduce((s, i) => s + i.amount, 0) * incomeFactor);
    const plannedOut = r2(inMonth.reduce((s, l) => s + l.amount, 0));
    const [y, m] = month.split('-').map(Number);
    const days = month === current ? new Date(y, m, 0).getDate() - today.getDate() + 1 : new Date(y, m, 0).getDate();
    const variable = inMonth.filter((l) => l.kind === 'variable').reduce((s, l) => s + l.amount, 0);
    return { month, expectedIncome, plannedOut, left: r2(expectedIncome - plannedOut), daily: r2(days > 0 ? variable / days : 0), lines: inMonth };
  });
}

export interface ForecastMonth {
  month: string;
  expectedIncome: number;
  plannedOut: number;
  left: number;
  balanceAfter: number;
}

/** A running balance from cash in accounts, month by month. */
export function runningBalance(start: number, months: { month: string; expectedIncome: number; plannedOut: number }[]): ForecastMonth[] {
  let balance = start;
  return months.map((m) => {
    const left = r2(m.expectedIncome - m.plannedOut);
    balance = r2(balance + left);
    return { ...m, left, balanceAfter: balance };
  });
}

export const SCENARIO_FACTOR = { cautious: 0.85, expected: 1, optimistic: 1.1 } as const;
export type PlanScenario = keyof typeof SCENARIO_FACTOR;
