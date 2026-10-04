// Plan and forecast: smart help on top of the engine (engine.ts).
//   - dropEffect: what placing a line in a month does to that month's
//     lowest balance (the friction popover's numbers).
//   - autoAllocate: places backlog items where the running balance stays at
//     or above the cushion for the whole horizon; splits a splittable item
//     into the fewest equal monthly payments that fit; otherwise leaves it
//     in the backlog with its shortfall.
//   - splitParts / fewestSplit: equal monthly payments.
//   - waitingGain: how much more cushion waiting keeps.
// Pure, tested in test/planEngine.test.ts.

import { runEngine, type EngineInput } from './engine';
import type { PlanLine } from './planDraft';

type Line = EngineInput['lines'][number];
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthWord = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Equal monthly payments; the last one absorbs the rounding. */
export function splitParts(amount: number, count: number, startMonth: string): { month: string; amount: number }[] {
  const n = Math.max(2, Math.min(12, Math.round(count)));
  const each = Math.floor((amount / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({ month: shiftMonth(startMonth, i), amount: i === n - 1 ? r2(amount - each * (n - 1)) : each }));
}

/** "Couch, 1 of 3" */
export function splitName(name: string, index: number, count: number) {
  return `${name}, ${index + 1} of ${count}`;
}

/**
 * The lowest balance from `fromMonth` to the horizon's end with some extra
 * lines placed. A payment only lowers the balance from its own month on, so
 * an earlier dip (already in the plan) never stops a later placement.
 */
function lowestFrom(input: EngineInput, extra: Line[], fromMonth: string): { balance: number; month: string } {
  const r = runEngine({ ...input, lines: [...input.lines, ...extra] });
  let low = { balance: Infinity, month: fromMonth };
  for (const m of r.months) if (m.month >= fromMonth && m.lowest < low.balance) low = { balance: m.lowest, month: m.month };
  return low;
}

export interface DropEffect {
  month: string;
  lowestBefore: number;
  lowestAfter: number;
  date: Date;
  belowCushion: boolean;
  belowZero: boolean;
  /** "Placing the couch here takes your lowest balance in November to 45,000, below your 200,000 cushion." */
  message: string | null;
}

/** What placing `line` in `month` does to that month's lowest balance (and the horizon's). */
export function dropEffect(input: EngineInput, line: Line, month: string): DropEffect {
  const without = input.lines.filter((l) => l.key !== line.key);
  const before = runEngine({ ...input, lines: without });
  const after = runEngine({ ...input, lines: [...without, { ...line, month, due: line.due && line.month === month ? line.due : null }] });
  // The worst month from here on: a payment's effect carries forward.
  const from = input.months.indexOf(month);
  const worst = (ms: typeof after.months) => ms.slice(Math.max(0, from)).reduce((a, b) => (b.lowest < a.lowest ? b : a));
  const b = worst(before.months);
  const a = worst(after.months);
  const belowZero = a.lowest < 0;
  const belowCushion = a.lowest < input.cushion;
  const where = monthWord(a.month);
  const message =
    belowCushion && a.lowest < b.lowest
      ? `Placing ${line.name.toLowerCase().startsWith('the ') ? line.name : `the ${line.name.toLowerCase()}`} here takes your lowest balance in ${where} to ${fmt(a.lowest)}, ${belowZero ? 'below zero' : `below your ${fmt(input.cushion)} cushion`}.`
      : null;
  return { month: a.month, lowestBefore: b.lowest, lowestAfter: a.lowest, date: a.lowestDate, belowCushion, belowZero, message };
}

export interface Candidate {
  key: string;
  name: string;
  kind: PlanLine['kind'];
  need: PlanLine['need'];
  priority: PlanLine['priority'];
  amount: number;
  /** yyyy-MM: not before this month (an income-tied item: its income's month). */
  notBefore: string | null;
  /** yyyy-MM: needed by this month. */
  neededBy: string | null;
  splittable: boolean;
  createdAt: Date | null;
}

export interface Placement {
  key: string;
  parts: { month: string; amount: number }[];
  reason: string;
}

export interface AllocateResult {
  placements: Placement[];
  unplaced: { key: string; reason: string; shortfall: number }[];
}

const NEED_RANK = { must: 0, nice: 1 } as const;
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 } as const;

/** Must have before Nice to have, High to Low, earliest Needed by, larger amounts first. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    NEED_RANK[a.need] - NEED_RANK[b.need] ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.neededBy ?? '9999-99').localeCompare(b.neededBy ?? '9999-99') ||
    b.amount - a.amount
  );
}

/**
 * Places backlog items into the plan. `input.lines` is the plan as it stands
 * (income, fixed recurring and paid lines are never touched: only the
 * candidates move). Each placement keeps the running balance at or above
 * the cushion from its month to the end of the horizon.
 */
export function autoAllocate(input: EngineInput, candidates: Candidate[]): AllocateResult {
  const placements: Placement[] = [];
  const unplaced: AllocateResult['unplaced'] = [];
  let working = input;
  const first = input.months[0];
  const last = input.months[input.months.length - 1];
  const horizonWord = `${input.months.length} months`;

  for (const c of [...candidates].sort(compareCandidates)) {
    const from = c.notBefore && c.notBefore > first ? c.notBefore : first;
    const to = c.neededBy && c.neededBy < last ? c.neededBy : last;
    const window = input.months.filter((m) => m >= from && m <= to);
    const asLine = (month: string, amount: number, key = c.key): Line => ({ key, name: c.name, kind: c.kind === 'variable' ? 'fixed' : c.kind, need: c.need, month, due: null, amount });

    let placed: Placement | null = null;
    let best = -Infinity;
    for (const month of window) {
      const low = lowestFrom(working, [asLine(month, c.amount)], month);
      best = Math.max(best, low.balance);
      if (low.balance >= input.cushion) {
        const free = runEngine(working).months.find((m) => m.month === month)?.freeAfterMustHaves ?? 0;
        placed = { key: c.key, parts: [{ month, amount: c.amount }], reason: `Fits in ${monthWord(month)}: ${fmt(free)} free after must-haves` };
        break;
      }
    }
    if (!placed && c.splittable) {
      for (let n = 2; n <= 12 && !placed; n++) {
        for (const start of window) {
          const parts = splitParts(c.amount, n, start);
          if (parts[parts.length - 1].month > last) break;
          const low = lowestFrom(working, parts.map((p, i) => asLine(p.month, p.amount, `${c.key}#${i}`)), start);
          if (low.balance >= input.cushion) {
            placed = { key: c.key, parts, reason: `Fits as ${n} payments of ${fmt(parts[0].amount)} from ${monthWord(start)}` };
            break;
          }
        }
      }
    }
    if (placed) {
      placements.push(placed);
      working = { ...working, lines: [...working.lines, ...placed.parts.map((p, i) => asLine(p.month, p.amount, `${c.key}#${i}`))] };
    } else {
      const shortfall = r2(Math.max(0, input.cushion - (Number.isFinite(best) ? best : input.cushion)));
      unplaced.push({ key: c.key, reason: `Doesn't fit in ${horizonWord}`, shortfall });
    }
  }
  return { placements, unplaced };
}

/** The fewest equal payments from `start` that keep the cushion, or null. */
export function fewestSplit(input: EngineInput, line: Line, start: string): { month: string; amount: number }[] | null {
  const last = input.months[input.months.length - 1];
  const others = input.lines.filter((l) => l.key !== line.key);
  for (let n = 2; n <= 12; n++) {
    const parts = splitParts(line.amount, n, start);
    if (parts[parts.length - 1].month > last) return null;
    const low = lowestFrom({ ...input, lines: others }, parts.map((p, i) => ({ ...line, key: `${line.key}#${i}`, month: p.month, due: null, amount: p.amount })), start);
    if (low.balance >= input.cushion) return parts;
  }
  return null;
}

/** The month (from `from`) where placing the line hurts least: the highest lowest balance. */
export function bestMonth(input: EngineInput, line: Line, from: string): string {
  const others = input.lines.filter((l) => l.key !== line.key);
  let best = { month: from, low: -Infinity };
  for (const m of input.months.filter((x) => x >= from)) {
    const low = lowestFrom({ ...input, lines: others }, [{ ...line, month: m, due: null }], from).balance;
    if (low > best.low) best = { month: m, low };
  }
  return best.month;
}

/**
 * "Waiting until January keeps 120,000 more cushion in November": how much
 * higher a month's lowest balance is when a nice-to-have waits until a later
 * month. Null when waiting doesn't help there.
 */
export function waitingGain(input: EngineInput, line: Line, laterMonth: string): { month: string; gain: number; text: string } | null {
  if (!line.month || laterMonth <= line.month) return null;
  const others = input.lines.filter((l) => l.key !== line.key);
  const now = runEngine({ ...input, lines: [...others, line] });
  const later = runEngine({ ...input, lines: [...others, { ...line, month: laterMonth, due: null }] });
  let best: { month: string; gain: number } | null = null;
  for (const m of now.months) {
    if (m.month >= laterMonth) break;
    const after = later.months.find((x) => x.month === m.month)!;
    const gain = r2(after.lowest - m.lowest);
    if (gain > 0.5 && (!best || gain > best.gain)) best = { month: m.month, gain };
  }
  return best ? { ...best, text: `Waiting until ${monthWord(laterMonth)} keeps ${fmt(best.gain)} more cushion in ${monthWord(best.month)}` } : null;
}
