import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifySpending } from '../app/src/viewmodels/finance/classify';
import { rangeTotals } from '../app/src/viewmodels/finance/metrics';
import { forecast, guidance } from '../app/src/viewmodels/finance/forecast';
import { comparisonPeriod, intervalsFor, periodFor } from '../app/src/viewmodels/finance/ranges';
import type { FinData, FinMonthPlan, FinPlanItem, FinTx } from '../app/src/viewmodels/finance/types';

const TODAY = new Date(2026, 8, 27, 12); // 27 Sep 2026

function tx(id: string, date: Date, amount: number, kind: FinTx['kind'] = 'expense', link: FinTx['link'] = null): FinTx {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return {
    id, date, month, kind, amount, categoryId: 'c1', categoryName: 'Food', accountId: 'a1', accountName: 'Cash',
    payee: id, link, fixed: false, savingsFlow: 0, debtRepayment: false,
  };
}

function item(over: Partial<FinPlanItem> & { itemId: string; month: string }): FinPlanItem {
  return {
    key: `${over.itemId}@${over.month}`, bucketId: 'b1', bucketName: 'Trip', name: over.itemId, type: 'Expense', fixed: false,
    planned: 0, available: 0, actual: 0, unexplained: 0, createdAt: null, ...over,
  };
}

function data(over: Partial<FinData> & { plans?: Record<string, Partial<FinMonthPlan>> } = {}): FinData {
  const { plans = {}, ...rest } = over;
  return {
    today: TODAY,
    txs: [],
    transfers: [],
    plan: (month) => ({ month, items: [], plannedIncome: 0, plannedExpense: 0, plannedSavings: 0, ...plans[month] }),
    allocations: [],
    justifications: [],
    payments: [],
    balance: { spending: 0, savings: 0 },
    savingsTarget: 0.2,
    forecastItems: [],
    firstMonth: '2026-01',
    ...rest,
  };
}

describe('unplanned classification', () => {
  it('1. an expense with no bucket is "no budget"', () => {
    const d = data({ txs: [tx('t', new Date(2026, 8, 5), 5000)] });
    const s = classifySpending(d.txs, d).get('t')!;
    assert.equal(s.kind, 'no_budget');
    assert.equal(s.unplanned, 5000);
  });

  it('2. an expense before its item was created is "added after"', () => {
    const link = { bucketId: 'b1', itemId: 'i1', month: '2026-09' };
    const d = data({
      txs: [tx('t', new Date(2026, 8, 10), 8000, 'expense', link)],
      plans: { '2026-09': { items: [item({ itemId: 'i1', month: '2026-09', planned: 8000, available: 8000, actual: 8000, createdAt: new Date(2026, 8, 12) })] } },
    });
    const s = classifySpending(d.txs, d).get('t')!;
    assert.equal(s.kind, 'added_after');
    assert.equal(s.addedAfter, 8000);
    assert.equal(s.planned, 0);
  });

  it('3. spending past the plan: the excess is "over plan", the rest planned', () => {
    const link = { bucketId: 'b1', itemId: 'hotel', month: '2026-09' };
    const d = data({
      txs: [tx('a', new Date(2026, 8, 3), 30000, 'expense', link), tx('b', new Date(2026, 8, 9), 32000, 'expense', link)],
      plans: { '2026-09': { items: [item({ itemId: 'hotel', month: '2026-09', planned: 50000, available: 50000, actual: 62000, createdAt: new Date(2026, 7, 1) })] } },
    });
    const splits = classifySpending(d.txs, d);
    assert.equal(splits.get('a')!.planned + splits.get('b')!.planned, 50000);
    assert.equal(splits.get('b')!.overPlan, 12000);
    assert.equal(splits.get('b')!.kind, 'over_plan');
  });
});

describe('totals', () => {
  it('4. budget moves between buckets change no totals', () => {
    const base = data({ txs: [tx('i', new Date(2026, 8, 1), 100000, 'income'), tx('e', new Date(2026, 8, 2), 40000)] });
    const moved = { ...base, allocations: [{ fromKey: 'x@2026-09', toKey: 'y@2026-09', amount: 20000, createdAt: new Date(2026, 8, 3) }] };
    const p = periodFor('month', TODAY);
    const a = rangeTotals(base, p, classifySpending(base.txs, base));
    const b = rangeTotals(moved, p, classifySpending(moved.txs, moved));
    assert.deepEqual([a.income, a.expense, a.net], [b.income, b.expense, b.net]);
    assert.deepEqual([a.income, a.expense, a.net], [100000, 40000, 60000]);
  });
});

describe('forecast', () => {
  // Six months (Mar–Aug) of 60,000 irregular income and 500,000 spending.
  const history: FinTx[] = [];
  for (let m = 2; m <= 7; m++) {
    history.push(tx(`inc${m}`, new Date(2026, m, 15), 60000, 'income'));
    history.push(tx(`exp${m}`, new Date(2026, m, 16), 500000));
  }
  const salary = { plannedIncome: 1013381 };

  it('5. salary rule plus the estimated irregular average', () => {
    const d = data({ txs: history, plans: { '2026-10': salary, '2026-11': salary } });
    const f = forecast(d, classifySpending(d.txs, d), { horizon: 3, scenario: 'expected', includeSavings: false });
    const oct = f.months.find((m) => m.month === '2026-10')!;
    assert.equal(oct.income, 1073381);
    assert.equal(oct.incomeEstimated, 60000);
  });

  it('6. a month with a budget plan uses the plan', () => {
    const d = data({ txs: history, plans: { '2026-10': { ...salary, plannedExpense: 836500 } } });
    const f = forecast(d, classifySpending(d.txs, d), { horizon: 3, scenario: 'expected', includeSavings: false });
    const oct = f.months.find((m) => m.month === '2026-10')!;
    assert.equal(oct.expense, 836500);
    assert.equal(oct.expenseSource, 'plan');
  });

  it('7. a negative gap raises a saving suggestion (the alert is a notification now)', () => {
    const d = data({ txs: history, plans: { '2026-11': { plannedIncome: 400000, plannedExpense: 900000 } } });
    const splits = classifySpending(d.txs, d);
    const f = forecast(d, splits, { horizon: 3, scenario: 'expected', includeSavings: false });
    const nov = f.months.find((m) => m.month === '2026-11')!;
    assert.ok(nov.gap < 0);
    assert.match(guidance(d, f).tips[0].text, /Save .* a month/);
  });

  it('9. a what-if expense changes that month immediately', () => {
    const d = data({ txs: history, plans: { '2027-01': salary } });
    const before = forecast(d, new Map(), { horizon: 4, scenario: 'expected', includeSavings: false }).months.find((m) => m.month === '2027-01')!;
    const withItem = { ...d, forecastItems: [{ id: 'f1', name: 'School fees', month: '2027-01', kind: 'expense' as const, amount: 250000 }] };
    const after = forecast(withItem, new Map(), { horizon: 4, scenario: 'expected', includeSavings: false }).months.find((m) => m.month === '2027-01')!;
    assert.equal(after.expense - before.expense, 250000);
    assert.equal(before.gap - after.gap, 250000);
  });

  it('10. under 3 months of history is low confidence', () => {
    const d = data({ txs: history.slice(-4), firstMonth: '2026-07' });
    assert.equal(forecast(d, new Map(), { horizon: 3, scenario: 'expected', includeSavings: false }).lowConfidence, true);
  });
});

describe('ranges', () => {
  it('8. a year shows 12 monthly intervals and compares with last year', () => {
    const year = periodFor('year', TODAY);
    assert.equal(intervalsFor(year).length, 12);
    const last = comparisonPeriod(year, 'lastYear');
    assert.equal(last.start.getFullYear(), 2025);
    assert.equal(last.end.getMonth(), 11);
  });
});
