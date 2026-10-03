// One budget line (an item in one month) as the Budget, Buckets and Bucket
// pages list it: the month's figures plus its status, what's left, and its
// account names. Each flow type is listed on its own, never mixed. Pure.

import { automationLabel, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { lineStatus, STATUS_TONE, type LineStatus, type StatusTone } from '@/src/shared/budget/monthTotals';
import type { ItemMonth, MonthBudget } from '@/src/shared/budget/monthBudget';

export interface LineRow extends ItemMonth {
  /** In the line's own flow's words (Received, Paid, Overdue, Saved...). */
  state: LineStatus;
  stateTone: StatusTone;
  /** Planned (with moves) minus actual; never negative for income. */
  left: number;
  accountName: string | null;
  toAccountName: string | null;
  automationText: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineRows(budget: MonthBudget, today: Date, accountName: (id: string | null) => string | null): Record<FlowType, LineRow[]> {
  const incomeName = (itemId: string) => budget.items.find((i) => i.itemId === itemId)?.name;
  const out = Object.fromEntries(FLOW_TYPES.map((t) => [t, [] as LineRow[]])) as Record<FlowType, LineRow[]>;
  for (const entry of budget.items) {
    const status = lineStatus(entry, today);
    out[entry.type].push({
      ...entry,
      state: status,
      stateTone: STATUS_TONE[status],
      left: entry.type === 'Income' ? r2(Math.max(0, entry.available - entry.actual)) : r2(entry.available - entry.actual),
      accountName: accountName(entry.accountId),
      toAccountName: accountName(entry.toAccountId),
      automationText: automationLabel(entry.automation, incomeName),
    });
  }
  // Soonest first, undated last, then by name.
  for (const type of FLOW_TYPES) {
    out[type].sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.name.localeCompare(b.name));
  }
  return out;
}

/** Must-haves still to pay this month against money actually available. */
export function mustHaves(rows: LineRow[], availableNow: number, availableByMonthEnd: number) {
  const open = rows.filter((r) => r.necessity === 'MustHave' && !r.closed && r.left > 0);
  const due = r2(open.reduce((s, r) => s + r.left, 0));
  return {
    count: open.length,
    due,
    availableNow,
    spareNow: r2(availableNow - due),
    spareByMonthEnd: r2(availableByMonthEnd - due),
    status: availableNow >= due ? ('covered' as const) : availableByMonthEnd >= due ? ('waiting' as const) : ('short' as const),
  };
}
