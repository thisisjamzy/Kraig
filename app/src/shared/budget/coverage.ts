// Coverage: which open lines the money already received pays for now,
// which wait for income still expected this month (and which income), and
// which aren't covered at all. Lines are walked in the order given (the
// Recommended order on Priorities); a line that doesn't fit stays put and
// later, smaller lines can still fit — each line is judged on its own
// against what's left. Pure; tested in test/planForecast.test.ts.

export type Coverage = 'now' | 'waiting' | 'not';

export const COVERAGE_ORDER: Coverage[] = ['now', 'waiting', 'not'];
export const COVERAGE_LABEL: Record<Coverage, string> = { now: 'Can pay now', waiting: 'Waiting for income', not: 'Not covered' };

export interface ExpectedIncome {
  name: string;
  amount: number;
  due: Date | null;
}

export interface Covered<T> {
  line: T;
  coverage: Coverage;
  /** For waiting lines: the income it waits for ("AIMS salary"). */
  waitsFor: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function coverageOf<T>(
  lines: T[],
  amountOf: (line: T) => number,
  availableNow: number,
  expected: ExpectedIncome[]
): { rows: Covered<T>[]; canPayNow: number; waiting: number; notCovered: number } {
  let now = Math.max(0, availableNow);
  // Expected income in date order, drawn down one source at a time.
  const sources = [...expected].filter((e) => e.amount > 0).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity)).map((e) => ({ ...e }));
  const rows: Covered<T>[] = [];
  let canPayNow = 0;
  let waiting = 0;
  let notCovered = 0;
  for (const line of lines) {
    const amount = Math.max(0, amountOf(line));
    if (amount <= now + 0.004) {
      now = r2(now - amount);
      canPayNow = r2(canPayNow + amount);
      rows.push({ line, coverage: 'now', waitsFor: null });
      continue;
    }
    // Use what's left now plus expected sources, in order, until covered.
    let need = r2(amount - now);
    const plan: { index: number; take: number }[] = [];
    for (let i = 0; i < sources.length && need > 0.004; i++) {
      const take = Math.min(sources[i].amount, need);
      if (take <= 0) continue;
      plan.push({ index: i, take });
      need = r2(need - take);
    }
    if (need > 0.004) {
      notCovered = r2(notCovered + amount);
      rows.push({ line, coverage: 'not', waitsFor: null });
      continue;
    }
    now = 0;
    for (const p of plan) sources[p.index].amount = r2(sources[p.index].amount - p.take);
    waiting = r2(waiting + amount);
    rows.push({ line, coverage: 'waiting', waitsFor: sources[plan[plan.length - 1].index].name });
  }
  return { rows, canPayNow, waiting, notCovered };
}
