// Money Home's words and groupings. Pure, tested in test/homeDebt.test.ts.
// No long dashes in anything generated here.

const DAY = 86_400_000;

/** "Good afternoon, James" */
export function greetingFor(now: Date, name: string): string {
  const h = now.getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "Due today", "Due tomorrow", "Due in 3 days", "1 day late", "3 days late". */
export function dueText(due: Date, today: Date): string {
  const days = Math.round((startOfDay(due).getTime() - startOfDay(today).getTime()) / DAY);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return `${-days} ${days === -1 ? 'day' : 'days'} late`;
}

/**
 * One line about where spending moved: the category up the most on last
 * month ("Transport is up 20% on last month"), else down the most, else the
 * month as a whole.
 */
export function categoryInsight(cats: { name: string; now: number; before: number }[], spent: number, lastSpent: number): string | null {
  const compared = cats.filter((c) => c.before > 0 && c.now >= 1000).map((c) => ({ ...c, change: (c.now - c.before) / c.before }));
  const up = [...compared].sort((a, b) => b.change - a.change)[0];
  if (up && up.change >= 0.1) return `${up.name} is up ${Math.round(up.change * 100)}% on last month`;
  const down = [...compared].sort((a, b) => a.change - b.change)[0];
  if (down && down.change <= -0.1) return `${down.name} is down ${Math.round(-down.change * 100)}% on last month`;
  if (cats[0] && spent > 0) return `Most of it went to ${cats[0].name} (${Math.round((cats[0].now / spent) * 100)}%)`;
  if (lastSpent > 0 && spent === 0) return 'Nothing spent yet this month';
  return null;
}

export interface FlowBar {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Cash flow bars: the last 30 days in weeks (oldest first, the last one
 * ending today), or the last 6 months.
 */
/**
 * Cash flow buckets (owner, 24 Nov 2026): the last `count` weeks, Monday to
 * Sunday, or the last `count` months, oldest first, the current one last.
 * Income and expenses are summed per bucket; a refund lowers expenses.
 */
export function weekBuckets(rows: { date: Date; income: number; expense: number }[], view: 'week' | 'month', today: Date, count = 12): FlowBar[] {
  if (view === 'month') return monthBuckets(rows, today, count);
  const end = startOfDay(today);
  const monday = new Date(end.getFullYear(), end.getMonth(), end.getDate() - ((end.getDay() + 6) % 7));
  const bars: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    bars.push({ key: String(from.getTime()), label: from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), income: 0, expense: 0, net: 0, from: from.getTime(), to: to.getTime() });
  }
  return fill(bars, rows);
}

/** The last `count` calendar months, oldest first. */
export function monthBuckets(rows: { date: Date; income: number; expense: number }[], today: Date, count = 12): FlowBar[] {
  const end = startOfDay(today);
  const bars: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    bars.push({ key: String(m.getTime()), label: m.toLocaleDateString('en-GB', { month: 'short' }), income: 0, expense: 0, net: 0, from: m.getTime(), to: next.getTime() });
  }
  return fill(bars, rows);
}

type Bucket = FlowBar & { from: number; to: number };

function fill(bars: Bucket[], rows: { date: Date; income: number; expense: number }[]): FlowBar[] {
  for (const r of rows) {
    const at = r.date.getTime();
    const bar = bars.find((b) => at >= b.from && at < b.to);
    if (!bar) continue;
    bar.income += r.income;
    bar.expense += r.expense;
  }
  return bars.map(({ key, label, income, expense }) => ({
    key,
    label,
    income: Math.round(income),
    expense: Math.round(Math.max(0, expense)),
    net: Math.round(income - Math.max(0, expense)),
  }));
}

/** This month against last: the share and the amount, or nulls when last month had nothing to compare with. */
export function monthChange(now: number, before: number): { change: number | null; changeAmount: number | null } {
  if (!(before > 0.5)) return { change: null, changeAmount: null };
  return { change: (now - before) / before, changeAmount: Math.round((now - before) * 100) / 100 };
}

/**
 * Commitments (owner, 24 Nov 2026): this month's planned outflow (expenses,
 * savings and transfers), what has been paid against it, what is still to
 * pay, and the part of that whose date has passed. A closed line has
 * nothing left. Planned = paid + left.
 */
export function commitmentsOf(
  items: { type: string; archived: boolean; closed: boolean; due: Date | null; available: number; actual: number }[],
  today: Date
): { planned: number; paid: number; left: number; overdue: number } {
  const day = startOfDay(today).getTime();
  let planned = 0;
  let left = 0;
  let overdue = 0;
  for (const i of items) {
    if (i.type === 'Income' || i.archived || !(i.available > 0)) continue;
    planned += i.available;
    const rest = i.closed ? 0 : Math.max(0, i.available - i.actual);
    left += rest;
    if (rest > 0.5 && i.due && i.due.getTime() < day) overdue += rest;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { planned: r2(planned), paid: r2(planned - left), left: r2(left), overdue: r2(overdue) };
}

/** "Your account balances are 1,947,623 more than your recorded transactions explain." */
export function unexplainedText(amount: number, format: (n: number) => string): string | null {
  if (Math.abs(amount) < 1) return null;
  // Above zero, money is missing: the balances are lower than the
  // transactions explain. Below zero, a surplus (src/viewmodels/gap.ts).
  return amount > 0
    ? `${format(amount)} is unaccounted for: your account balances are lower than your recorded transactions explain.`
    : `You have a ${format(-amount)} surplus: your account balances are higher than your recorded transactions explain.`;
}

/** Home's upcoming payments: unpaid lines that pay out (expenses, savings,
 * transfers), never income, soonest first. */
export function upcomingLines<
  T extends { type: string; archived: boolean; closed: boolean; due: Date | null; available: number; actual: number },
>(items: T[], count = 5): T[] {
  return items
    .filter((i) => i.type !== 'Income' && !i.archived && !i.closed && i.due !== null && i.available - i.actual > 0.5)
    .sort((a, b) => a.due!.getTime() - b.due!.getTime())
    .slice(0, count);
}

/** "15 projects · 42 open tasks · 3 at risk" (sentence case). */
export function areaFigures(a: { projects: number; openTasks: number; atRisk: number }): string {
  return [`${a.projects} ${a.projects === 1 ? 'project' : 'projects'}`, `${a.openTasks} open ${a.openTasks === 1 ? 'task' : 'tasks'}`, a.atRisk ? `${a.atRisk} at risk` : null]
    .filter(Boolean)
    .join(' · ');
}
