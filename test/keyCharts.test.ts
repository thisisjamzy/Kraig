import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { incomeConsistency, incomeExpenseTrend, keyCashFlow, keyWindow, savingsTrend } from '../app/src/viewmodels/finance/keyCharts';
import { periodFor } from '../app/src/viewmodels/finance/ranges';
import type { FinData, FinTx } from '../app/src/viewmodels/finance/types';

const TODAY = new Date(2026, 8, 20, 12); // 20 Sep 2026 — September not over

let n = 0;
function tx(year: number, month0: number, amount: number, kind: FinTx['kind'], savingsFlow = 0): FinTx {
  const date = new Date(year, month0, 10);
  return {
    id: `t${n++}`, date, month: `${year}-${String(month0 + 1).padStart(2, '0')}`, kind, amount,
    categoryId: null, categoryName: 'x', accountId: 'a', accountName: 'Cash', payee: '', link: null, fixed: false, savingsFlow, debtRepayment: false,
  };
}

function data(txs: FinTx[], over: Partial<FinData> = {}): FinData {
  return {
    today: TODAY, txs, transfers: [],
    plan: (month) => ({ month, items: [], plannedIncome: 0, plannedExpense: 0, plannedSavings: 0 }),
    allocations: [], justifications: [], payments: [], balance: { spending: 0, savings: 0 },
    savingsTarget: 0.2, forecastItems: [], firstMonth: '2025-01', ...over,
  };
}

/** Oct 2025 … Sep 2026 as [year, month0]. */
const WINDOW = Array.from({ length: 12 }, (_, i) => [2025 + Math.floor((9 + i) / 12), (9 + i) % 12] as const);

describe('key charts', () => {
  it('1. Sep 2026 shows Oct 2025 to Sep 2026, September selected and "so far"', () => {
    const d = data(WINDOW.map(([y, m]) => tx(y, m, 100, 'income')));
    const w = keyWindow(d, periodFor('month', TODAY));
    assert.equal(w.label, 'Oct 2025 to Sep 2026');
    assert.equal(w.intervals.length, 12);
    const last = w.intervals[11];
    assert.equal(last.key, '2026-09');
    assert.ok(last.selected && last.current);
    assert.equal(w.intervals.filter((i) => i.selected).length, 1);
  });

  it('2. two low months are red and the rating is "Somewhat variable"', () => {
    // Window ending at August (complete), with March and July low.
    const txs = WINDOW.slice(0, 11).map(([y, m]) => tx(y, m, m === 2 ? 850000 : m === 6 ? 870000 : 1020000, 'income'));
    const d = data(txs);
    const w = keyWindow(d, periodFor('month', new Date(2026, 7, 15)));
    const chart = incomeConsistency(d, w);
    const block = chart.blocks[0].data;
    const below = block.points.filter((p) => p.tone === 'below').map((p) => p.interval.key);
    assert.deepEqual(below, ['2026-03', '2026-07']);
    assert.equal(block.rating, 'Somewhat variable');
    assert.equal(chart.status, 'watch');
    assert.match(chart.blocks[0].caption, /March and July were low/);
  });

  it('3. April spending past income gives a −65,000 net', () => {
    const txs = [tx(2026, 3, 1020000, 'income'), tx(2026, 3, 1085000, 'expense')];
    const d = data(txs);
    const chart = keyCashFlow(d, keyWindow(d, periodFor('month', TODAY)));
    const april = chart.blocks[0].data.points.find((p) => p.interval.key === '2026-04')!;
    assert.equal(april.net, -65000);
    assert.match(chart.blocks[0].caption, /April was the only deficit \(−65,000\)/);
  });

  it('4. expenses growing faster than income: Watch, and when they meet', () => {
    const txs: FinTx[] = [];
    WINDOW.slice(0, 11).forEach(([y, m], i) => {
      txs.push(tx(y, m, Math.round(1000000 * 1.04 ** i), 'income'));
      txs.push(tx(y, m, Math.round(500000 * 1.09 ** i), 'expense'));
    });
    const d = data(txs);
    const chart = incomeExpenseTrend(d, keyWindow(d, periodFor('month', TODAY)));
    const t = chart.blocks[0].data;
    assert.ok(Math.abs(t.incomeGrowth! - 0.04) < 0.005);
    assert.ok(Math.abs(t.expenseGrowth! - 0.09) < 0.005);
    assert.equal(chart.status, 'watch');
    assert.match(chart.blocks[0].caption, /meet in about \d+ months/);
  });

  it('5. a savings withdrawal is a negative bar', () => {
    const txs = [tx(2026, 5, 100000, 'savings', -100000), tx(2026, 4, 150000, 'savings', 150000)];
    const d = data(txs, { balance: { spending: 0, savings: 400000 } });
    const chart = savingsTrend(d, keyWindow(d, periodFor('month', TODAY)));
    const bars = (chart.blocks[1].data as { points: { interval: { key: string }; contribution: number | null }[] }).points;
    assert.equal(bars.find((p) => p.interval.key === '2026-06')!.contribution, -100000);
    assert.match(chart.blocks[1].caption, /withdrawals in June/);
  });

  it('6. a month with no transactions is a gap, not zero', () => {
    const txs = WINDOW.filter(([, m]) => m !== 1).map(([y, m]) => tx(y, m, 500, 'income'));
    const d = data(txs);
    const chart = keyCashFlow(d, keyWindow(d, periodFor('month', TODAY)));
    const feb = chart.blocks[0].data.points.find((p) => p.interval.key === '2026-02')!;
    assert.equal(feb.income, null);
    assert.equal(feb.net, null);
  });
});
