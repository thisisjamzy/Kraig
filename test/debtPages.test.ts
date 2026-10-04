// The debt page and forms: the callout sentence, the plan's projection, the
// Impact card wording, where each form opens, and that removed pages
// redirect to their replacements.
// Run: npx tsx --test test/debtPages.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  daysLate,
  debtStateSentence,
  newDebtImpact,
  nextPayment,
  planSentence,
  projectPayments,
  repaymentImpact,
  type PlanLike,
} from '../app/src/viewmodels/debt';
import { debtFormPageHref, isDebtFormKind, withoutDebtForm } from '../app/src/shared/navigation/debtForms';
import { isFormPage } from '../app/src/shared/navigation/navHistory';
import nextConfig from '../app/next.config';

const LONG_DASH = /[–—]/;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
// Saturday 3 October 2026.
const today = new Date(2026, 9, 3);

const monthly = (amount: number, next: Date, override: PlanLike['nextOverride'] = null): PlanLike => ({ amount, interval: 'monthly', nextPaymentDate: next, isActive: true, nextOverride: override });

test('the callout: what is left, how late the next payment is, when it is paid off', () => {
  const s = debtStateSentence(200_000, monthly(50_000, new Date(2026, 8, 28)), today, fmt);
  assert.equal(s, "200,000 left to repay. The next payment of 50,000 is 5 days late. At this plan it's paid off in December.");
  assert.equal(debtStateSentence(0, null, today, fmt), 'Paid off. Nothing left to repay.');
  assert.equal(debtStateSentence(80_000, null, today, fmt), '80,000 left to repay. No payment plan is set.');
  assert.match(debtStateSentence(80_000, monthly(50_000, new Date(2026, 9, 10)), today, fmt), /is due on 10 Oct/);
  assert.match(debtStateSentence(80_000, monthly(50_000, today), today, fmt), /is due today/);
});

test('the projection runs until the balance is gone, past the year boundary', () => {
  const payments = projectPayments(200_000, monthly(30_000, new Date(2026, 9, 15)));
  assert.equal(payments.length, 7);
  assert.equal(payments.at(-1)!.balance, 0);
  assert.equal(payments.at(-1)!.date.getMonth(), 3); // April
  assert.match(debtStateSentence(200_000, monthly(30_000, new Date(2026, 9, 15)), today, fmt), /paid off in April 2027\./);
  assert.deepEqual(projectPayments(0, monthly(30_000, today)), []);
  assert.deepEqual(projectPayments(100, null), []);
});

test('a one-off next payment comes first, then the plan carries on', () => {
  const plan = monthly(50_000, new Date(2026, 9, 28), { amount: 20_000, date: new Date(2026, 9, 10) });
  assert.deepEqual(nextPayment(plan), { amount: 20_000, date: new Date(2026, 9, 10) });
  const payments = projectPayments(120_000, plan);
  assert.deepEqual(
    payments.map((p) => [p.date.getMonth(), p.date.getDate(), p.balance]),
    [
      [9, 10, 100_000],
      [9, 28, 50_000],
      [10, 28, 0],
    ]
  );
});

test('days late counts whole days and never goes negative', () => {
  assert.equal(daysLate(new Date(2026, 8, 28, 18), today), 5);
  assert.equal(daysLate(new Date(2026, 9, 9), today), 0);
});

test('plan text: "50,000 monthly, from MTN Mobile Money"', () => {
  assert.equal(planSentence(monthly(50_000, today), 'MTN Mobile Money', fmt), '50,000 monthly, from MTN Mobile Money');
  assert.equal(planSentence({ ...monthly(10_000, today), interval: 'biweekly' }, null, fmt), '10,000 every 2 weeks');
  assert.equal(planSentence(null, null, fmt), 'No plan');
});

test('new debt impact: cash debt counts as income for its month, record only changes nothing', () => {
  const cash = newDebtImpact({ cash: true, amount: 200_000, accountName: 'MTN Mobile Money', borrowedOn: today }, today, fmt);
  assert.deepEqual(cash.lines, ['Adds 200,000 to MTN Mobile Money and counts as October income (borrowed).', 'Adds 200,000 to what you owe.']);
  assert.deepEqual(cash.warnings, []);
  const past = newDebtImpact({ cash: true, amount: 200_000, accountName: 'MTN Mobile Money', borrowedOn: new Date(2026, 8, 12) }, today, fmt);
  assert.deepEqual(past.warnings, ["This adds 200,000 to September's income and changes September's figures."]);
  const record = newDebtImpact({ cash: false, amount: 200_000, accountName: null, borrowedOn: today }, today, fmt);
  assert.deepEqual(record.lines, ["Adds 200,000 to what you owe. Your balances don't change."]);
});

test('repayment impact: what is owed after, and the account it leaves', () => {
  assert.deepEqual(repaymentImpact({ amount: 50_000, balance: 200_000, accountName: 'MTN Mobile Money' }, fmt).lines, [
    'Reduces what you owe to 150,000 and takes 50,000 from MTN Mobile Money.',
  ]);
  assert.deepEqual(repaymentImpact({ amount: 50_000, balance: 200_000, accountName: null }, fmt).lines, ["Reduces what you owe to 150,000. Your balances don't change."]);
  const over = repaymentImpact({ amount: 250_000, balance: 200_000, accountName: null }, fmt);
  assert.deepEqual(over.warnings, ['This is more than the 200,000 you owe.']);
  assert.match(over.lines[0], /^Pays this debt off/);
});

test('no long dashes in any of the words', () => {
  const words = [
    debtStateSentence(200_000, monthly(50_000, new Date(2026, 8, 28)), today, fmt),
    ...newDebtImpact({ cash: true, amount: 1, accountName: 'A', borrowedOn: new Date(2026, 1, 1) }, today, fmt).lines,
    ...repaymentImpact({ amount: 9, balance: 1, accountName: 'A' }, fmt).warnings,
  ];
  for (const w of words) assert.doesNotMatch(w, LONG_DASH);
});

test('debt forms: full-page addresses for phones, and the peek params come off cleanly', () => {
  assert.equal(debtFormPageHref('new'), '/debts/new');
  assert.equal(debtFormPageHref('repay', 'd1', { amount: '50000' }), '/debts/d1/repay?amount=50000');
  assert.equal(debtFormPageHref('wallet', 'd 1', { to: 'existing' }), '/debts/d%201/wallet?to=existing');
  assert.equal(withoutDebtForm('/debts/d1', 'debtForm=wallet&debt=d1&to=cash&step=2&x=1'), '/debts/d1?x=1');
  assert.equal(withoutDebtForm('/debts', 'debtForm=new'), '/debts');
  assert.equal(isDebtFormKind('wallet'), true);
  assert.equal(isDebtFormKind('archive'), false);
});

test('every debt form page is a form for Back purposes, the debt page is not', () => {
  for (const kind of ['edit', 'repay', 'plan', 'wallet'] as const) assert.equal(isFormPage(debtFormPageHref(kind, 'd1')), true, kind);
  assert.equal(isFormPage('/debts/new'), true);
  assert.equal(isFormPage('/debts/d1'), false);
  assert.equal(isFormPage('/debts'), false);
});

test('removed pages are gone and their old URLs redirect to the replacements', async () => {
  const routes = join(__dirname, '../app/app/(mobile)');
  const redirects = await nextConfig.redirects!();
  const target = (source: string, query?: string) =>
    redirects.find((r) => r.source === source && (query ? r.has?.some((h) => h.type === 'query' && h.key === 'tab' && h.value === query) : !r.has))?.destination;
  for (const [path, to] of [
    ['address-book', '/projects'],
    ['projects/control-panel', '/settings'],
  ]) {
    assert.equal(existsSync(join(routes, path, 'page.tsx')), false, `${path} still has a page`);
    assert.equal(target(`/${path}`), to);
  }
  // Buckets analytics is a phone-line page again (docs/UI-LINES.md); the
  // page itself sends wide screens to /statistics, so no server redirect.
  assert.equal(existsSync(join(routes, 'buckets/analytics', 'page.tsx')), true);
  assert.equal(target('/buckets/analytics'), undefined);
  assert.equal(target('/budget', 'history'), '/transactions');
  assert.equal(target('/budget', 'payments'), '/payments');
  // The rebuilt debt forms all have their own page for phones.
  for (const path of ['debts/new', 'debts/[id]/edit', 'debts/[id]/repay', 'debts/[id]/plan', 'debts/[id]/wallet']) {
    assert.equal(existsSync(join(routes, path, 'page.tsx')), true, path);
  }
});
