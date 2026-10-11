// Unaccounted money per budget month, and the month's unhealthy spend.
//
// A reconciliation sets each wallet to what the household reports and adds
// the gap (ledger minus reported) to the Unjustified wallet
// (src/shared/firestore/unaccountedBalance.ts). Recording a past expense
// "paid from unaccounted money" moves that amount back out of it, as a
// real expense. So for one month:
//
//   recorded    = the gaps of the checks done in the month
//   explained   = expenses explained against unaccounted money, dated in
//                 the month (minus income explained the same way)
//   unaccounted = recorded − explained, never below zero: money that went
//                 somewhere nobody can name
//
//   unhealthy spend = unplanned spending + unaccounted
//
// The explained part is already counted as spending (planned or
// unplanned), so nothing is counted twice. Pure: tested in
// test/unaccounted.test.ts.

export interface ReconciliationLike {
  performedAt: Date;
  /** Signed: ledger minus reported. Positive is money missing. */
  totalGap: number;
}

export interface ExplainedLike {
  date: Date;
  amount: number;
  direction: 'Inflow' | 'Outflow';
}

export interface MonthUnaccounted {
  /** Reconciliations done in the month. */
  checks: number;
  recorded: number;
  explained: number;
  unaccounted: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function monthUnaccounted(month: string, reconciliations: ReconciliationLike[], explained: ExplainedLike[]): MonthUnaccounted {
  const checks = reconciliations.filter((r) => monthOf(r.performedAt) === month);
  const recorded = r2(checks.reduce((sum, r) => sum + r.totalGap, 0));
  const explainedTotal = r2(
    explained.filter((e) => monthOf(e.date) === month).reduce((sum, e) => sum + (e.direction === 'Outflow' ? e.amount : -e.amount), 0)
  );
  return { checks: checks.length, recorded, explained: explainedTotal, unaccounted: r2(Math.max(0, recorded - explainedTotal)) };
}

/** The month's unhealthy spend: unplanned spending plus unaccounted money. */
export function unhealthySpend(unplannedSpent: number, unaccounted: number) {
  return { unplanned: r2(unplannedSpent), unaccounted: r2(unaccounted), total: r2(unplannedSpent + unaccounted) };
}
