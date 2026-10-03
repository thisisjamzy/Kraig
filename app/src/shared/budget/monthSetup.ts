// Month setup: every recurring income, expense, savings and transfer item
// is in a month's budget from its first day, ready to review.
//
// Decision (PRD prompt section 2.2): month lines stay DERIVED from the
// bucket items (templates) by monthBudget.ts's itemOccurrence, not copied
// into stored per-month docs. Everything stored lines would add is already
// supported on the item, by month key:
//   - this month only edits: monthOverrides[yyyy-MM] (amount, due date);
//   - this and future months edits: changesFrom[yyyy-MM];
//   - a line deleted for one month: excludedMonths (never regenerated);
//   - one-off lines: a one-off item due in that month.
// Each occurrence already has a deterministic id, itemMonthKey
// (itemId@yyyy-MM), which transactions, allocations and the payment queue
// (queue id itemId__yyyyMM) key on. Copying lines would mean a second
// source of truth to keep in step with every template edit.
//
// What is stored per month is a small budgetMonths/{yyyy-MM} doc, created
// once by its deterministic id: when the month was set up, the lines it
// started with (for the start-of-month banner) and whether it's reviewed.

import { addMonths, itemOccurrence, monthKeyOf, monthTitleOf, type BudgetItemLike } from './monthBudget';
import { itemFlow, type FlowType } from './flow';

/** At most this many skipped months are set up after a long absence. */
const MAX_BACKFILL = 12;

/**
 * Months to set up on opening the app: any month since the last one set
 * up, then the current and next month — skipping those already set up.
 */
export function monthsToSetUp(today: Date, existing: Iterable<string>, lastSetUp: string | null): string[] {
  const have = new Set(existing);
  const current = monthKeyOf(today);
  const next = addMonths(current, 1);
  let start = current;
  if (lastSetUp && lastSetUp < current) {
    start = addMonths(lastSetUp, 1);
    const earliest = addMonths(current, -MAX_BACKFILL);
    if (start < earliest) start = earliest;
  }
  const out: string[] = [];
  for (let month = start; month <= next; month = addMonths(month, 1)) {
    if (!have.has(month)) out.push(month);
  }
  return out;
}

export interface SetupLine {
  key: string; // itemId@yyyy-MM
  bucketId: string;
  itemId: string;
  type: FlowType;
}

/** The lines a month has from its (non-archived) buckets' items. */
export function monthLines(
  month: string,
  buckets: { id: string; type?: FlowType | null; archived?: boolean }[],
  itemsByBucket: Record<string, BudgetItemLike[]>,
  categories: Map<string, { transactionType: 'Expense' | 'Income' | 'Savings' }>
): SetupLine[] {
  const out: SetupLine[] = [];
  for (const bucket of buckets) {
    if (bucket.archived) continue;
    for (const item of itemsByBucket[bucket.id] ?? []) {
      if (!itemOccurrence(item, month)) continue;
      out.push({ key: `${item.id}@${month}`, bucketId: bucket.id, itemId: item.id, type: itemFlow(bucket.type ?? 'Expense', item.categoryId, categories) });
    }
  }
  return out;
}

export function setupCounts(lines: SetupLine[]) {
  const count = (type: FlowType) => lines.filter((line) => line.type === type).length;
  return { income: count('Income'), expense: count('Expense'), savings: count('Savings'), transfer: count('Transfer') };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "October is set up from your recurring items. 14 lines added: 2 income, 9 expenses, 2 savings, 1 transfer." */
export function setupBannerText(month: string, counts: ReturnType<typeof setupCounts>): string {
  const total = counts.income + counts.expense + counts.savings + counts.transfer;
  const name = monthTitleOf(month).split(' ')[0];
  const parts = [
    `${counts.income} income`,
    plural(counts.expense, 'expense', 'expenses'),
    `${counts.savings} savings`,
    plural(counts.transfer, 'transfer', 'transfers'),
  ];
  return `${name} is set up from your recurring items. ${plural(total, 'line', 'lines')} added: ${parts.join(', ')}.`;
}
