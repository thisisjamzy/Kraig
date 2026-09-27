// Planned vs unplanned spending, per expense transaction.
//
//   planned       — within the plan its budget item had ON the transaction's
//                   date (the item existed by then, plus budget moves made
//                   before it);
//   no_budget     — not assigned to any bucket item;
//   added_after   — beyond that plan, but covered by budget added on or
//                   after the date (item created later, or money moved in
//                   afterwards): the budget was made to fit the spending;
//   over_plan     — beyond even the item's final effective plan.
//
// Items' per-month amount overrides carry no timestamp, so an override
// counts as part of the plan from the start of the month.

import type { FinAllocation, FinData, FinTx } from './types';

export type UnplannedKind = 'no_budget' | 'added_after' | 'over_plan';

export interface TxPlanSplit {
  planned: number;
  noBudget: number;
  addedAfter: number;
  overPlan: number;
  unplanned: number;
  /** The biggest unplanned part, or null when it's all planned. */
  kind: UnplannedKind | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function split(planned: number, noBudget: number, addedAfter: number, overPlan: number): TxPlanSplit {
  const unplanned = r2(noBudget + addedAfter + overPlan);
  const parts: [UnplannedKind, number][] = [
    ['no_budget', noBudget],
    ['added_after', addedAfter],
    ['over_plan', overPlan],
  ];
  const top = parts.sort((a, b) => b[1] - a[1])[0];
  return {
    planned: r2(planned),
    noBudget: r2(noBudget),
    addedAfter: r2(addedAfter),
    overPlan: r2(overPlan),
    unplanned,
    kind: unplanned > 0.004 ? top[0] : null,
  };
}

/** Classifies every expense transaction in `txs` (others are skipped). */
export function classifySpending(txs: FinTx[], data: Pick<FinData, 'plan' | 'allocations'>): Map<string, TxPlanSplit> {
  const out = new Map<string, TxPlanSplit>();
  const byKey = new Map<string, FinTx[]>();
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    if (!t.link) {
      if (t.amount > 0) out.set(t.id, split(0, t.amount, 0, 0));
      continue;
    }
    const key = `${t.link.itemId}@${t.link.month}`;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }

  const movesByKey = new Map<string, FinAllocation[]>();
  for (const a of data.allocations) {
    for (const k of [a.toKey, a.fromKey]) {
      if (k) movesByKey.set(k, [...(movesByKey.get(k) ?? []), a]);
    }
  }

  for (const [key, list] of byKey) {
    const month = key.slice(key.lastIndexOf('@') + 1);
    const item = data.plan(month).items.find((i) => i.key === key);
    if (!item) {
      // Paid against a month the item no longer has (skipped/removed).
      for (const t of list) if (t.amount > 0) out.set(t.id, split(0, t.amount, 0, 0));
      continue;
    }
    const moves = movesByKey.get(key) ?? [];
    const planOn = (d: Date) => {
      const base = !item.createdAt || item.createdAt < d ? item.planned : 0;
      const moved = moves.reduce((s, a) => {
        if (!a.createdAt || a.createdAt >= d) return s;
        return s + (a.toKey === key ? a.amount : 0) - (a.fromKey === key ? a.amount : 0);
      }, 0);
      return base + moved;
    };
    let spent = 0;
    for (const t of [...list].sort((a, b) => a.date.getTime() - b.date.getTime())) {
      if (t.amount <= 0) {
        spent += t.amount; // a refund frees plan back up
        continue;
      }
      const planned = Math.min(t.amount, Math.max(0, planOn(t.date) - spent));
      const rest = t.amount - planned;
      const addedAfter = Math.min(rest, Math.max(0, item.available - spent - planned));
      out.set(t.id, split(planned, 0, addedAfter, rest - addedAfter));
      spent += t.amount;
    }
  }
  return out;
}

export const UNPLANNED_LABELS: Record<UnplannedKind, string> = {
  no_budget: 'No budget',
  added_after: 'Added after',
  over_plan: 'Over plan',
};
