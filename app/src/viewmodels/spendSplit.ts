// A category's spend split in two: planned (paid against a basket item)
// and unplanned (the category only, no item). Amounts are what counts as
// spend for the category: money out positive, a refund back in negative
// (an Income category the other way round), so the parts add up to the
// total the list shows.

export interface SplitRow {
  /** Counts toward the total: + spend (or income received), − a refund. */
  amount: number;
  planned: boolean;
}

export interface SpendSplit {
  total: number;
  planned: number;
  unplanned: number;
  plannedCount: number;
  unplannedCount: number;
  /** 0 to 100, the planned part of the total (0 when nothing was spent). */
  plannedPercent: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function spendSplit(rows: SplitRow[]): SpendSplit {
  let planned = 0;
  let unplanned = 0;
  let plannedCount = 0;
  let unplannedCount = 0;
  for (const row of rows) {
    if (row.planned) {
      planned += row.amount;
      plannedCount += 1;
    } else {
      unplanned += row.amount;
      unplannedCount += 1;
    }
  }
  const total = r2(planned + unplanned);
  const plannedPercent = total > 0 ? Math.max(0, Math.min(100, Math.round((planned / total) * 100))) : 0;
  return { total, planned: r2(planned), unplanned: r2(unplanned), plannedCount, unplannedCount, plannedPercent };
}

/** What a transaction adds to its category's figure (aggregation.ts's sign rule). */
export function categoryContribution(t: { type: string; direction: string; amount: number }): number {
  const signed = t.direction === 'Inflow' ? t.amount : -t.amount;
  return t.type === 'Income' ? signed : -signed;
}
