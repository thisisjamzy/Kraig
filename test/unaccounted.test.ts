// Unaccounted money per month and the month's unhealthy spend
// (app/src/shared/budget/unaccounted.ts), plus the screens around it:
// the reconciliation check, the past expense switch, Settings > Tools.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { monthUnaccounted, unhealthySpend } from '../app/src/shared/budget/unaccounted';
import { gapPhrase, readGap, readUnaccounted } from '../app/src/viewmodels/gap';
import { SETTINGS_GROUPS } from '../app/src/logic/settingsCenter/sections';

const read = (path: string) => readFileSync(join(__dirname, '../app/src', path), 'utf8');
const day = (iso: string) => new Date(`${iso}T12:00:00`);

test('a month: the gaps its checks recorded, minus what was explained since, never below zero', () => {
  const checks = [
    { performedAt: day('2026-10-03'), totalGap: 20_000 },
    { performedAt: day('2026-10-20'), totalGap: 15_000 },
    { performedAt: day('2026-09-28'), totalGap: 50_000 }, // another month
  ];
  const explained = [
    { date: day('2026-10-02'), amount: 12_000, direction: 'Outflow' as const },
    { date: day('2026-10-05'), amount: 2_000, direction: 'Inflow' as const }, // money found: back into unaccounted
    { date: day('2026-11-01'), amount: 9_000, direction: 'Outflow' as const }, // another month
  ];
  const october = monthUnaccounted('2026-10', checks, explained);
  assert.deepEqual(october, { checks: 2, recorded: 35_000, explained: 10_000, unaccounted: 25_000 });
  assert.equal(monthUnaccounted('2026-11', checks, explained).unaccounted, 0, 'explaining more than was recorded never goes negative');
  assert.equal(monthUnaccounted('2026-08', checks, explained).checks, 0);
});

test('unhealthy spend is unplanned spending plus unaccounted money', () => {
  assert.deepEqual(unhealthySpend(40_000, 25_000), { unplanned: 40_000, unaccounted: 25_000, total: 65_000 });
});

test('a check keeps what was already unaccounted, and says so before saving', () => {
  const write = read('shared/firestore/unaccountedBalance.ts');
  assert.match(write, /unaccountedBefore/);
  assert.match(write, /unaccountedAfter: round2\(unaccountedBefore \+ totalGap\)/);
  assert.match(write, /currentBalance: increment\(totalGap\)/, 'the new gap is added, never in place of what was there');
  const screen = read('screens/Reconciliation/ReconciliationScreen.tsx');
  assert.match(screen, /Before this check/);
  assert.match(screen, /After this check/);
  assert.match(read('screens/ReconciliationHistory/ReconciliationHistoryScreen.tsx'), /Before: \{phrase\(row\.unaccountedBefore\)\}/);
});

test('more money than expected reads as a surplus, never a negative gap or balance', () => {
  assert.deepEqual(readGap(12_000), { kind: 'missing', amount: 12_000, label: 'Missing' });
  assert.deepEqual(readGap(-5_000), { kind: 'surplus', amount: 5_000, label: 'Surplus' });
  assert.equal(readGap(0.001).kind, 'none');
  assert.equal(readUnaccounted(-20_000).label, 'Surplus');
  assert.equal(readUnaccounted(20_000).label, 'Unaccounted for');
  const fmt = (n: number) => n.toLocaleString('en-US');
  assert.equal(gapPhrase(-5_000, fmt), '5,000 surplus');
  assert.equal(gapPhrase(12_000, fmt), '12,000 missing');
  // No screen shows a gap or the unaccounted balance with a minus sign.
  for (const p of ['screens/Reconciliation/ReconciliationScreen.tsx', 'screens/ReconciliationHistory/ReconciliationHistoryScreen.tsx']) {
    const src = read(p);
    assert.doesNotMatch(src, /totalGap > 0 \? '\+'|unaccountedBalance > 0 \? '\+'|liveGap > 0 \? '\+'/, p);
  }
  assert.doesNotMatch(read('phone/screens/Home/HomeScreen.tsx'), /balance\.unjustified > 0 \? '\+'/);
});

test('the Budget card details show unplanned, unaccounted and unhealthy spend', () => {
  const parts = read('phone/screens/Planning/MinimalParts.tsx');
  for (const label of ['Unplanned spending', 'Unaccounted for', 'Unhealthy spend']) assert.match(parts, new RegExp(label));
  assert.match(read('phone/screens/Planning/BudgetTab.tsx'), /useMonthUnaccounted\(month\)/);
});

test('a past expense can be paid from unaccounted money, suggested after a check that month, never hidden', () => {
  const logic = read('logic/addTransaction/useLogic.ts');
  assert.match(logic, /entryDate <= monthUnaccountedState\.lastCheckAt/);
  assert.match(logic, /explainsChoice \?\? suggestExplains/);
  const screen = read('screens/AddTransaction/AddTransactionScreen.tsx');
  assert.doesNotMatch(screen, /<MoreOptions/);
  assert.match(read('strings/stringConstants.tsx'), /explainUnjustifiedLabel: 'Paid from unaccounted money'/);
});

test('Tools is its own Settings section, not part of Import and export', () => {
  const data = SETTINGS_GROUPS.find((g) => g.label === 'Data')!;
  assert.deepEqual(data.sections.map((s) => s.id), ['data', 'tools']);
  const sections = read('settings/SettingsSections.tsx');
  assert.match(sections, /id === 'tools' && <Tools \/>/);
  assert.doesNotMatch(sections, /<Group title="Tools">/);
});
