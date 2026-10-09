// A basket's budget snapshot (app/src/logic/planningBucket/basketReceipt.ts)
// and its PDF (receiptPdf.ts).
// Run: npx tsx --test test/basketReceipt.test.ts

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDict, PDFDocument, PDFStream } from 'pdf-lib';
import { buildMonthBudget, type MonthBudgetInput } from '../app/src/shared/budget/monthBudget';
import { lineRows } from '../app/src/logic/budgetMonth/lines';
import { buildBasketReceipt, DEFAULT_RECEIPT_OPTIONS, receiptAmount, receiptFileName, type ReceiptOptions, type ReceiptSource } from '../app/src/logic/planningBucket/basketReceipt';
import { receiptPdf, type ReceiptAssetBytes } from '../app/src/logic/planningBucket/receiptPdf';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T00:00:00`) }) as never;
const NOW = new Date(2026, 9, 5, 18, 19);
const MONTH = '2026-10';
const ASSETS: ReceiptAssetBytes = [readFileSync('app/public/fonts/JetBrainsMono-Regular.ttf'), readFileSync('app/public/fonts/JetBrainsMono-Bold.ttf'), readFileSync('app/public/logo_primary.png')];

const categories: MonthBudgetInput['categories'] = new Map([
  ['utilities', { name: 'Utilities', transactionType: 'Expense' }],
  ['salary', { name: 'Salary', transactionType: 'Income' }],
]);

function item(id: string, extra: Record<string, unknown> = {}) {
  return { id, goalId: 'run', name: id, amount: 100, categoryId: 'utilities', dueDate: ts('2026-01-05'), recurrence: { frequency: 'Monthly' as const, interval: 1 }, completed: false, charges: null, ...extra };
}

const tx = (id: string, itemId: string, amount: number, bucketId = 'run') => ({
  id,
  accountId: 'uba',
  amount,
  direction: 'Outflow' as const,
  type: 'Expense',
  categoryId: 'utilities',
  month: MONTH,
  bucketItem: { bucketId, itemId, month: MONTH },
});

function budget(itemsByBucket: MonthBudgetInput['itemsByBucket'], transactions: ReturnType<typeof tx>[] = []) {
  return buildMonthBudget({
    month: MONTH,
    buckets: [
      { id: 'run', name: 'Running Douala', currency: 'XAF', type: 'Expense', kind: 'Fixed' },
      { id: 'pay', name: 'Salary', currency: 'XAF', type: 'Income', kind: 'Fixed' },
      { id: 'empty', name: 'Empty', currency: 'XAF', type: 'Expense', kind: 'Variable' },
    ],
    itemsByBucket,
    transactions: transactions as never,
    transfers: [],
    allocations: [],
    accountCurrency: new Map([['uba', 'XAF']]),
    accountType: new Map([['uba', 'Bank']]),
    categories,
    baseCurrency: 'XAF',
    toDisplay: (amount) => amount,
  });
}

const ITEMS = {
  run: [
    item('rent', { name: 'Rent', amount: 150_000, necessity: 'MustHave', priority: 'High' }),
    item('power', { name: 'Electricity (ENEO) for the flat and the shop downstairs', amount: 40_000, dueDate: ts('2026-01-10') }),
    item('water', { name: 'Water', amount: 20_000, dueDate: ts('2026-01-20') }),
    item('net', { name: 'Internet', amount: 60_000, dueDate: ts('2026-01-25') }),
    item('gas', { name: 'Gas', amount: 40_000, dueDate: ts('2026-01-28') }),
  ],
  pay: [item('aims', { goalId: 'pay', name: 'AIMS salary', categoryId: 'salary', amount: 1_013_381, dueDate: ts('2026-01-25') })],
  empty: [],
};

function source(extra: Partial<ReceiptSource> = {}, transactions = [tx('t1', 'rent', 40_000), tx('t2', 'water', 20_000)]): ReceiptSource {
  return {
    budget: budget(ITEMS, transactions),
    bucket: { id: 'run', name: 'Running Douala', description: 'Bills for the Douala flat', type: 'Expense', kind: 'Fixed', notes: null, defaultPaidFrom: 'account:uba' },
    accountName: (id) => (id === 'uba' ? 'UBA' : null),
    adjustments: [],
    currency: 'XAF',
    now: NOW,
    ...extra,
  };
}

const opts = (o: Partial<ReceiptOptions> = {}): ReceiptOptions => ({ ...DEFAULT_RECEIPT_OPTIONS, ...o });

describe('budget snapshot data', () => {
  test('header, details and summary', () => {
    const r = buildBasketReceipt('run', MONTH, opts(), source());
    assert.equal(r.header.title, 'BUDGET SNAPSHOT');
    assert.equal(r.header.name, 'Running Douala');
    assert.equal(r.header.typeLine, 'Expense basket · Fixed · Recurring');
    assert.equal(r.header.description, 'Bills for the Douala flat');
    assert.deepEqual(
      r.details.map((d) => [d.label, d.value]),
      [
        ['Month', 'October 2026'],
        ['Printed', '05/10/2026 18:19'],
        ['Account', 'UBA (default paid from)'],
        ['Status', 'On track'],
      ]
    );
    assert.deepEqual(
      r.summary.map((d) => [d.label, d.value]),
      [
        ['Planned', '310,000'],
        ['Spent', '60,000'],
        ['Left', '250,000'],
        ['Items', '5'],
        ['Paid / unpaid', '1 / 4'],
      ]
    );
    assert.deepEqual(r.totals.map((t) => t.value), ['310,000 XAF', '60,000 XAF', '250,000 XAF']);
    assert.equal(r.fileName, 'dreda-budget-snapshot-running-douala-2026-10.pdf');
    assert.match(r.footer.reference, /^REF RUN-2026-10$/);
  });

  test('2. figures match the basket page for the same month', () => {
    const s = source();
    const r = buildBasketReceipt('run', MONTH, opts(), s);
    // The basket page: lineRows for the type, filtered to the basket, summed.
    const lines = lineRows(s.budget, NOW, s.accountName).Expense.filter((l) => l.bucketId === 'run');
    assert.equal(r.figures.planned, lines.reduce((x, l) => x + l.available, 0));
    assert.equal(r.figures.actual, lines.reduce((x, l) => x + l.actual, 0));
    assert.deepEqual(
      r.groups[0].items.map((i) => [i.name, i.planned, i.actual]),
      lines.map((l) => [l.name, l.available, l.actual])
    );
  });

  test('items show only the name, planned and spent', () => {
    const r = buildBasketReceipt('run', MONTH, opts(), source());
    assert.deepEqual(r.columns, { item: 'Item', planned: 'Planned', actual: 'Spent' });
    const rent = r.groups[0].items.find((i) => i.name === 'Rent')!;
    assert.deepEqual([rent.name, rent.plannedText, rent.actualText], ['Rent', '150,000', '40,000']);
    assert.equal(/Oct|Must have|High|Unpaid/.test(JSON.stringify(r.groups)), false);
  });

  test('grouped by status with subtotals', () => {
    const r = buildBasketReceipt('run', MONTH, opts({ groupByStatus: true }), source());
    assert.deepEqual(
      r.groups.map((g) => [g.label, g.items.length, g.subtotal?.planned]),
      [
        ['Paid', 1, '20,000'],
        ['Unpaid', 4, '290,000'],
      ]
    );
  });

  test('4. adjustments and notes only when they exist and are included', () => {
    const plain = buildBasketReceipt('run', MONTH, opts(), source());
    assert.equal(plain.adjustments.length, 0);
    assert.equal(plain.notes, null);

    const s = source({ bucket: { ...source().bucket, notes: '  Meter read on the 1st.  ' }, adjustments: [{ date: new Date(2026, 9, 4), title: 'Moved from Food', amount: 4_000 }, { date: null, title: 'Undone', amount: 1, reverted: true }] });
    const full = buildBasketReceipt('run', MONTH, opts(), s);
    assert.deepEqual(full.adjustments, [{ date: '4 Oct', title: 'Moved from Food', amount: '4,000' }]);
    assert.equal(full.notes, 'Meter read on the 1st.');

    const off = buildBasketReceipt('run', MONTH, opts({ adjustments: false, notes: false }), s);
    assert.equal(off.adjustments.length, 0);
    assert.equal(off.notes, null);
  });

  test('over plan: "Over by" and the status', () => {
    const all = [tx('a', 'rent', 150_000), tx('b', 'power', 40_000), tx('c', 'water', 20_000), tx('d', 'net', 60_000)];
    const over = buildBasketReceipt('run', MONTH, opts(), source({}, [...all, tx('e', 'gas', 44_000)]));
    assert.deepEqual(over.overLines, ['Over by 4,000']);
    assert.equal(over.details.find((d) => d.label === 'Status')!.value, 'Over plan');
    const paid = buildBasketReceipt('run', MONTH, opts(), source({}, [...all, tx('e', 'gas', 40_000)]));
    assert.equal(paid.details.find((d) => d.label === 'Status')!.value, 'Fully paid');
  });

  test('5. income baskets use their own words', () => {
    const r = buildBasketReceipt('pay', MONTH, opts(), source({ bucket: { id: 'pay', name: 'Salary', type: 'Income' } }, []));
    assert.deepEqual([r.columns.planned, r.columns.actual], ['Expected', 'Received']);
    assert.deepEqual(r.totals.map((t) => t.label), ['TOTAL EXPECTED', 'TOTAL RECEIVED', 'BALANCE LEFT']);
    assert.equal(r.details.some((d) => d.label === 'Account'), false);
  });

  test('8. an empty basket: zeros and "No items this month."', () => {
    const r = buildBasketReceipt('empty', MONTH, opts(), source({ bucket: { id: 'empty', name: 'Empty', type: 'Expense' } }));
    assert.equal(r.emptyText, 'No items this month.');
    assert.equal(r.groups.length, 0);
    assert.deepEqual(r.summary.slice(0, 4).map((s) => s.value), ['0', '0', '0', '0']);
  });

  test('offline note and QR', () => {
    const r = buildBasketReceipt('run', MONTH, opts({ qr: true }), source({ offline: { lastSync: new Date(2026, 9, 5, 18, 2) }, link: 'https://dreda.app/budget/basket/run?month=2026-10' }));
    assert.equal(r.details.at(-1)!.value, 'Printed offline, figures as of last sync 18:02');
    assert.equal(r.footer.qr, 'https://dreda.app/budget/basket/run?month=2026-10');
  });

  test('no long dashes anywhere; amounts with separators', () => {
    const r = buildBasketReceipt('run', MONTH, opts({ groupByStatus: true }), source({ offline: { lastSync: null } }));
    assert.equal(/[–—]/.test(JSON.stringify(r)), false);
    assert.equal(receiptAmount(1_013_381.5), '1,013,381.5');
    assert.equal(receiptAmount(-4000), '-4,000');
    assert.equal(receiptFileName('Épargne & Co', MONTH), 'dreda-budget-snapshot-epargne-co-2026-10.pdf');
  });
});

describe('budget snapshot PDF', () => {
  test('1. selectable text, fonts embedded, the logo the only image', async () => {
    const r = buildBasketReceipt('run', MONTH, opts(), source({ bucket: { ...source().bucket, notes: 'Meter read on the 1st.' } }));
    const bytes = await receiptPdf(r, ASSETS);
    const doc = await PDFDocument.load(bytes);
    const all = doc.context.enumerateIndirectObjects().map(([, o]) => (o instanceof PDFDict ? o.toString() : o instanceof PDFStream ? o.dict.toString() : ''));
    const dicts = all.join('\n');
    // The logo (and its transparency mask) at the logo's own size: no picture of the page.
    const images = all.filter((d) => /\/Subtype \/Image/.test(d));
    assert.ok(images.length >= 1);
    assert.ok(images.every((d) => /\/Width 312\b/.test(d) && /\/Height 91\b/.test(d)), 'every image is logo_primary.png');
    assert.match(dicts, /\/FontFile2/, 'TrueType font embedded');
    assert.match(dicts, /\/ToUnicode/, 'text maps back to Unicode (selectable, searchable)');
    assert.equal(doc.getTitle(), 'Running Douala, budget snapshot');
  });

  test('3. 80 mm: one page sized to the content; A4 centres and paginates', async () => {
    const many = { run: Array.from({ length: 60 }, (_, i) => item(`i${i}`, { name: `Item number ${i + 1}`, amount: 1_000 + i })), pay: [], empty: [] };
    const s = source({ budget: budget(many) });
    const roll = await PDFDocument.load(await receiptPdf(buildBasketReceipt('run', MONTH, opts({ paper: 'receipt' }), s), ASSETS));
    assert.equal(roll.getPageCount(), 1);
    const { width, height } = roll.getPage(0).getSize();
    assert.ok(Math.abs(width - (80 * 72) / 25.4) < 0.01);
    assert.ok(height > 842, 'taller than A4 for 60 items, still one page');

    const short = await PDFDocument.load(await receiptPdf(buildBasketReceipt('run', MONTH, opts({ paper: 'receipt' }), source()), ASSETS));
    assert.ok(short.getPage(0).getSize().height < height);

    const a4 = await PDFDocument.load(await receiptPdf(buildBasketReceipt('run', MONTH, opts({ paper: 'a4' }), s), ASSETS));
    assert.ok(a4.getPageCount() > 1);
    assert.deepEqual(
      a4.getPages().map((p) => Math.round(p.getSize().width)),
      a4.getPages().map(() => 595)
    );
  });
});
