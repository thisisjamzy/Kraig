// A basket's budget snapshot: everything the printed or exported snapshot
// shows, as
// plain data, built from the same month budget (src/shared/budget/
// monthBudget.ts) and line rows (src/logic/budgetMonth/lines.ts) as the
// basket page, so every figure matches it. Pure; tested in
// test/basketReceipt.test.ts. ReceiptView (HTML, for printing and the
// preview) and receiptPdf.ts (a vector PDF) both draw this data, never the
// live page. Text on the receipt never uses long dashes.

import type { MonthBudget } from '@/src/shared/budget/monthBudget';
import { BASKET_REPEATS_LABEL, basketRepeats, FLOW_NOUN, type FlowType } from '@/src/shared/budget/flow';
import { lineRows, type LineRow } from '@/src/logic/budgetMonth/lines';
import { summaryStatus } from './basketPage';
import { monthTitle, reasonLabel } from '@/src/viewmodels/planning';

export type ReceiptPaper = 'receipt' | 'a4';

export interface ReceiptOptions {
  paper: ReceiptPaper;
  adjustments: boolean;
  notes: boolean;
  qr: boolean;
  groupByStatus: boolean;
}

export const DEFAULT_RECEIPT_OPTIONS: ReceiptOptions = {
  paper: 'a4',
  adjustments: true,
  notes: true,
  qr: false,
  groupByStatus: false,
};

export interface ReceiptSource {
  /** The month budget for the receipt's month (the basket page's own). */
  budget: MonthBudget;
  bucket: { id: string; name: string; description?: string | null; type?: FlowType | null; kind?: 'Fixed' | 'Variable' | null; repeats?: 'monthly' | 'once' | null; notes?: string | null; defaultPaidFrom?: string | null };
  accountName: (id: string | null) => string | null;
  /** Money moved in or out of the basket this month. */
  adjustments: { date: Date | null; title: string; amount: number; reverted?: boolean }[];
  /** The display currency (XAF). */
  currency: string;
  /** When it was printed. */
  now: Date;
  /** Built from cached data: when the figures were last synced. */
  offline?: { lastSync: Date | null } | null;
  /** The basket in the app, for the QR code. */
  link?: string;
}

export interface ReceiptLine {
  label: string;
  value: string;
}

export type ReceiptItemStatus = 'done' | 'open' | 'overdue';

export interface ReceiptItem {
  name: string;
  planned: number;
  actual: number;
  plannedText: string;
  actualText: string;
  status: ReceiptItemStatus;
}

export interface ReceiptGroup {
  /** Null when items aren't grouped. */
  label: string | null;
  items: ReceiptItem[];
  subtotal: { planned: string; actual: string } | null;
}

export interface BasketReceipt {
  /** The basket's description, when it has one. */
  header: { title: string; name: string; typeLine: string; description: string | null };
  details: ReceiptLine[];
  summary: ReceiptLine[];
  /** "Over by 4,000", "Justified: price went up". */
  overLines: string[];
  columns: { item: string; planned: string; actual: string };
  groups: ReceiptGroup[];
  /** "No items this month." when the basket has none. */
  emptyText: string | null;
  adjustments: { date: string; title: string; amount: string }[];
  notes: string | null;
  totals: ReceiptLine[];
  footer: { text: string; reference: string; qr: string | null };
  currency: string;
  paper: ReceiptPaper;
  fileName: string;
  /** The raw figures, for checks against the basket page. */
  figures: { planned: number; actual: number; left: number; items: number; done: number; open: number };
}

/** The words each money type uses: Planned / Spent, Expected / Received... */
export const RECEIPT_WORDS: Record<FlowType, { planned: string; actual: string; done: string; open: string; overdue: string }> = {
  Expense: { planned: 'Planned', actual: 'Spent', done: 'Paid', open: 'Unpaid', overdue: 'Overdue' },
  Income: { planned: 'Expected', actual: 'Received', done: 'Received', open: 'Expected', overdue: 'Late' },
  Savings: { planned: 'Planned', actual: 'Saved', done: 'Saved', open: 'Not saved', overdue: 'Overdue' },
  Transfer: { planned: 'Planned', actual: 'Moved', done: 'Moved', open: 'Not moved', overdue: 'Overdue' },
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 310000 as "310,000"; cents only when there are any; minus as a plain hyphen. */
export function receiptAmount(n: number): string {
  const v = r2(n);
  const text = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return v < 0 ? `-${text}` : text;
}

const two = (n: number) => String(n).padStart(2, '0');
const dayMonth = (d: Date) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
const stamp = (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** "running-douala" */
export function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'basket'
  );
}

/** dreda-budget-snapshot-running-douala-2026-10.pdf */
export function receiptFileName(name: string, month: string): string {
  return `dreda-budget-snapshot-${slug(name)}-${month}.pdf`;
}

/** Done (paid, received, saved, moved), overdue, or still open. */
function statusOf(line: LineRow): ReceiptItemStatus {
  if (line.state === 'Overdue' || line.state === 'Late') return 'overdue';
  if (line.state === 'Paid' || line.state === 'Over plan' || line.state === 'Received' || line.state === 'Saved' || line.state === 'Moved') return 'done';
  return 'open';
}

/**
 * The receipt for one basket and month. `source.budget` must be that
 * month's budget (the one the basket page shows).
 */
export function buildBasketReceipt(basketId: string, month: string, options: ReceiptOptions, source: ReceiptSource): BasketReceipt {
  const { budget, bucket, currency, now } = source;
  const type: FlowType = (bucket.type ?? 'Expense') as FlowType;
  const words = RECEIPT_WORDS[type];
  // The basket page's lines: same builder, same filter, same order.
  const lines = lineRows(budget, now, source.accountName)[type].filter((l) => l.bucketId === basketId);
  const planned = r2(lines.reduce((s, l) => s + l.available, 0));
  const actual = r2(lines.reduce((s, l) => s + l.actual, 0));
  const left = r2(planned - actual);

  // ---- Header and details ----
  const typeLine = [`${FLOW_NOUN[type]} basket`, type === 'Expense' && bucket.kind ? bucket.kind : null, BASKET_REPEATS_LABEL[basketRepeats(bucket)]].filter(Boolean).join(' · ');
  const paidFrom = bucket.defaultPaidFrom?.startsWith('account:')
    ? source.accountName(bucket.defaultPaidFrom.slice(8))
    : bucket.defaultPaidFrom === 'savings'
      ? 'Savings'
      : null;
  const base = summaryStatus(planned, actual, type).text;
  const allDone = lines.length > 0 && lines.every((l) => statusOf(l) === 'done');
  const status = base === 'Over plan' ? 'Over plan' : allDone ? (type === 'Expense' ? 'Fully paid' : `Fully ${words.done.toLowerCase()}`) : base;
  const details: ReceiptLine[] = [
    { label: 'Month', value: monthTitle(month) },
    { label: 'Printed', value: stamp(now) },
    ...(type !== 'Income' ? [{ label: 'Account', value: paidFrom ? `${paidFrom} (default paid from)` : 'Not set' }] : []),
    { label: 'Status', value: status },
  ];
  if (source.offline) {
    details.push({ label: 'Note', value: source.offline.lastSync ? `Printed offline, figures as of last sync ${clock(source.offline.lastSync)}` : 'Printed offline, figures as of the last sync' });
  }

  // ---- Items ----
  // Just the item and its two figures: no dates, needs or statuses.
  const items: ReceiptItem[] = lines.map((l) => ({
    name: l.name,
    planned: l.available,
    actual: l.actual,
    plannedText: receiptAmount(l.available),
    actualText: receiptAmount(l.actual),
    status: statusOf(l),
  }));
  const subtotal = (xs: ReceiptItem[]) => ({ planned: receiptAmount(xs.reduce((s, x) => s + x.planned, 0)), actual: receiptAmount(xs.reduce((s, x) => s + x.actual, 0)) });
  const groups: ReceiptGroup[] = options.groupByStatus
    ? (['done', 'open', 'overdue'] as const)
        .map((s) => {
          const xs = items.filter((i) => i.status === s);
          return { label: s === 'done' ? words.done : s === 'open' ? words.open : words.overdue, items: xs, subtotal: subtotal(xs) };
        })
        .filter((g) => g.items.length > 0)
    : items.length
      ? [{ label: null, items, subtotal: null }]
      : [];

  const done = items.filter((i) => i.status === 'done').length;
  const summary: ReceiptLine[] = [
    { label: words.planned, value: receiptAmount(planned) },
    { label: words.actual, value: receiptAmount(actual) },
    { label: 'Left', value: receiptAmount(left) },
    { label: 'Items', value: String(items.length) },
    { label: `${words.done} / ${words.open.toLowerCase()}`, value: `${done} / ${items.length - done}` },
  ];
  const overLines: string[] = [];
  if (type !== 'Income' && actual > planned + 0.5) {
    overLines.push(`Over by ${receiptAmount(actual - planned)}`);
    const reasons = [...new Set(lines.filter((l) => l.justified && l.justified.amount > 0).map((l) => reasonLabel(l.justified!.reason).toLowerCase()))];
    if (reasons.length) overLines.push(`Justified: ${reasons.join(', ')}`);
  }

  // ---- Adjustments, notes, totals, footer ----
  const adjustments = options.adjustments
    ? source.adjustments.filter((a) => !a.reverted).map((a) => ({ date: a.date ? dayMonth(a.date) : '', title: a.title, amount: receiptAmount(a.amount) }))
    : [];
  const notes = options.notes && bucket.notes?.trim() ? bucket.notes.trim() : null;
  const totals: ReceiptLine[] = [
    { label: `TOTAL ${words.planned.toUpperCase()}`, value: `${receiptAmount(planned)} ${currency}` },
    { label: `TOTAL ${words.actual.toUpperCase()}`, value: `${receiptAmount(actual)} ${currency}` },
    { label: 'BALANCE LEFT', value: `${receiptAmount(left)} ${currency}` },
  ];
  const reference = `REF ${basketId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-${month}`;

  return {
    header: { title: 'BUDGET SNAPSHOT', name: bucket.name, typeLine, description: bucket.description?.trim() || null },
    details,
    summary,
    overLines,
    columns: { item: 'Item', planned: words.planned, actual: words.actual },
    groups,
    emptyText: items.length ? null : 'No items this month.',
    adjustments,
    notes,
    totals,
    footer: { text: 'Generated with Dreda', reference, qr: options.qr && source.link ? source.link : null },
    currency,
    paper: options.paper,
    fileName: receiptFileName(bucket.name, month),
    figures: { planned, actual, left, items: items.length, done, open: items.length - done },
  };
}
