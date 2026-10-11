// The Money and Time dashboards (Remix/Dashboard/dashboards-redesign.md):
// periods, scales, formats, layouts, and every card's figures in every
// period, on the sample data in app/src/viewmodels/dashboard/fixtures.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPeriod, bucketsBetween, historyBuckets, stepAnchor, DASH_KINDS, periodChoices, type DashKind } from '../app/src/shared/dashboard/period';
import { linearScale, logScale, makeScale } from '../app/src/shared/dashboard/scale';
import { compact, money, hours, duration, signedCompact } from '../app/src/shared/dashboard/format';
import { MONEY_LAYOUT, TIME_LAYOUT, cardsIn } from '../app/src/shared/dashboard/layouts';
import { GUIDE } from '../app/src/shared/dashboard/guides';
import { balanceAt, flowsIn, moneyDashboard, walletKind } from '../app/src/viewmodels/dashboard/money';
import { categoryOf, timeDashboard, timeEntries, trackedIn, workdaysIn } from '../app/src/viewmodels/dashboard/time';
import { FIXTURE_NOW, moneyFixture, timeFixture } from '../app/src/viewmodels/dashboard/fixtures';
import { spreadLabels, boxStats, waterfallSpans } from '../app/src/widgets/Charts/math';

const LONG_DASH = /[–—]/;
const now = FIXTURE_NOW; // Wednesday 30 September 2026, 15:10

// ---- Periods ----

test('a week runs Monday to Sunday and compares with the same point last week', () => {
  const p = buildPeriod('week', now, now);
  assert.equal(p.start.getDay(), 1);
  assert.equal(p.start.getDate(), 28);
  assert.equal(p.end.getDate(), 5);
  assert.ok(p.inProgress);
  assert.equal(p.to.getTime(), now.getTime());
  // Wednesday 15:10 last week.
  assert.equal(p.compare!.start.getDate(), 21);
  assert.equal(p.compare!.end.getTime(), new Date(2026, 8, 23, 15, 10).getTime());
  assert.equal(p.label, '28 Sep to 4 Oct');
});

test('a finished period compares with the whole previous one; next stops at the current period', () => {
  const august = buildPeriod('month', new Date(2026, 7, 15), now);
  assert.equal(august.inProgress, false);
  assert.equal(august.compare!.start.getMonth(), 6);
  assert.equal(august.compare!.end.getTime(), august.start.getTime());
  assert.equal(stepAnchor(buildPeriod('month', now, now), 1), null, 'Next is off on the current period');
  assert.ok(stepAnchor(august, 1));
  assert.equal(stepAnchor(buildPeriod('all', now, now), -1), null);
});

test('buckets still to come are marked future, never zero', () => {
  const p = buildPeriod('week', now, now);
  const days = bucketsBetween('day', p.start, p.end, p.now);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.future), [false, false, false, true, true, true, true]);
  assert.ok(days[2].current);
  const year = bucketsBetween('month', buildPeriod('year', now, now).start, buildPeriod('year', now, now).end, now);
  assert.equal(year.filter((b) => b.future).length, 3, 'October to December');
  assert.equal(historyBuckets(buildPeriod('month', now, now), 'month', 12).length, 12);
});

// ---- Scales and formats ----

test('a linear scale has round ticks just above the largest value; a log scale has powers of ten', () => {
  const lin = linearScale(472_000);
  assert.deepEqual(lin.ticks, [0, 200_000, 400_000, 600_000]);
  assert.equal(lin.pos(300_000), 50);
  const log = logScale(472_000, 800);
  assert.deepEqual(log.ticks, [100, 1000, 10_000, 100_000, 1_000_000]);
  assert.equal(log.pos(0), 0, 'zero sits on the floor');
  assert.ok(Math.abs(log.pos(10_000) - 50) < 0.001);
  const neg = makeScale([-12_000, 5000], 'linear', true);
  assert.ok(neg.min < 0 && neg.ticks.includes(0));
});

test('one formatting module: currency, compact, hours, real minus signs', () => {
  assert.equal(money(472000, 'XAF'), 'XAF 472,000');
  assert.equal(money(-12500, 'XAF'), 'XAF −12,500');
  assert.equal(compact(472_000), '472k');
  assert.equal(compact(1_400_000), '1.4M');
  assert.equal(compact(-32_000), '−32k');
  assert.equal(signedCompact(5000), '+5k');
  assert.equal(hours(52), '52 min');
  assert.equal(hours(38.5 * 60), '38.5 h');
  assert.equal(hours(1439 * 60), '1,439 h');
  assert.equal(duration(150), '2 h 30 min');
});

// ---- Layouts ----

test('each period shows the brief’s cards in order', () => {
  assert.deepEqual(cardsIn(MONEY_LAYOUT.day), ['dayHours', 'plan', 'recLatest', 'dayTx']);
  assert.deepEqual(cardsIn(MONEY_LAYOUT.week), ['flow', 'plan', 'wf', 'recEach', 'recLatest', 'recLog', 'tree', 'when']);
  const month = cardsIn(MONEY_LAYOUT.month);
  assert.equal(month.indexOf('recLog'), month.indexOf('recRate') + 1, 'Month adds the log after the untracked cards');
  assert.ok(!cardsIn(MONEY_LAYOUT.year).includes('recLog'));
  const all = cardsIn(MONEY_LAYOUT.all);
  for (const gone of ['plan', 'fc', 'dayHours']) assert.ok(!all.includes(gone), gone);
  assert.ok(all.includes('box'));
  assert.deepEqual(cardsIn(TIME_LAYOUT.day), ['dayline', 'donut', 'projects', 'plan']);
  assert.ok(!cardsIn(TIME_LAYOUT.year).includes('plan'), 'no plan for Year');
  assert.ok(cardsIn(TIME_LAYOUT.all).includes('tree') && !cardsIn(TIME_LAYOUT.all).includes('radar'));
  for (const kind of DASH_KINDS) for (const e of [...MONEY_LAYOUT[kind], ...TIME_LAYOUT[kind]]) if ('span' in e) assert.ok(e.span >= 1 && e.span <= 12);
});

test('guides explain how to read each chart type, with no long dashes', () => {
  for (const g of Object.values(GUIDE)) {
    assert.doesNotMatch(g.title + g.text, LONG_DASH);
    assert.ok(g.title.startsWith('How to read'));
  }
});

// ---- Money ----

const input = moneyFixture();

test('every Money period builds every card in its layout, in words with no long dashes', () => {
  for (const kind of DASH_KINDS) {
    const p = buildPeriod(kind, now, now, new Date(2024, 8, 1));
    const ids = cardsIn(MONEY_LAYOUT[kind]);
    const dash = moneyDashboard(input, p, ids);
    assert.equal(dash.kpis.length, 6, kind);
    for (const id of ids) {
      const card = dash.cards[id as keyof typeof dash.cards];
      assert.ok(card, `${kind}: ${id}`);
      for (const text of [card.title, card.subtitle ?? '', card.insight ?? '', card.empty ?? '']) assert.doesNotMatch(text, LONG_DASH, `${kind} ${id}: ${text}`);
    }
    for (const text of [dash.hero.label, dash.hero.sub, dash.hero.insight ?? '', ...dash.kpis.flatMap((k) => [k.label, k.value, k.sub ?? '', k.pill?.text ?? ''])]) assert.doesNotMatch(text, LONG_DASH);
  }
});

test('the waterfall always closes: opening + income − spending − fees − net untracked', () => {
  for (const kind of DASH_KINDS) {
    const p = buildPeriod(kind, now, now, new Date(2024, 8, 1));
    const f = flowsIn(input, { start: p.start, end: p.to });
    const opening = balanceAt(input, p.start);
    const closing = balanceAt(input, p.to);
    assert.ok(Math.abs(closing - (opening + f.income - f.spent - f.fees - f.netUntracked)) < 1, kind);
    const card = moneyDashboard(input, p, ['wf']).cards.wf;
    if (card && card.id === 'wf') {
      const spans = waterfallSpans(card.steps);
      assert.equal(spans.length, card.steps.length);
      const changes = card.steps.filter((s) => s.kind !== 'total').reduce((a, s) => a + s.value, 0);
      assert.ok(Math.abs(card.opening + changes - card.closing) < 1, `${kind}: steps add up`);
    }
  }
});

test('untracked money: missing and found per check, by wallet, as a share of spending', () => {
  const sept = buildPeriod('month', now, now);
  const f = flowsIn(input, { start: sept.start, end: sept.to });
  const checks = input.checks.filter((c) => c.at >= sept.start && c.at < sept.to);
  const diffs = checks.flatMap((c) => c.wallets.map((w) => w.counted - w.recorded));
  assert.equal(f.missing, Math.round(diffs.filter((d) => d < 0).reduce((a, d) => a - d, 0) * 100) / 100);
  assert.equal(f.netUntracked, Math.round((f.missing - f.found) * 100) / 100);
  const dash = moneyDashboard(input, sept, ['recWallet', 'recRate', 'recEach', 'recLatest']);
  const wallets = dash.cards.recWallet;
  assert.ok(wallets && wallets.id === 'recWallet' && wallets.rows[0].label === 'Leaderbag');
  const rate = dash.cards.recRate;
  assert.ok(rate && rate.id === 'recRate' && rate.target === 2);
  const latest = dash.cards.recLatest;
  assert.ok(latest && latest.id === 'recLatest' && latest.rows.find((r) => r.name === 'Savings')?.due, 'a wallet never checked is due');
});

test('future slots are empty, never zero; wallet types from their labels', () => {
  const year = buildPeriod('year', now, now);
  const dash = moneyDashboard(input, year, ['flow', 'recEach']);
  const flow = dash.cards.flow;
  assert.ok(flow && flow.id === 'flow' && flow.data.filter((d) => d.future).length === 3);
  const rec = dash.cards.recEach;
  assert.ok(rec && rec.id === 'recEach' && rec.data.slice(-3).every((d) => d.value === null));
  assert.equal(walletKind('Cash'), 'cash');
  assert.equal(walletKind('Mobile Money'), 'mobile');
  assert.equal(walletKind('Current Account'), 'bank');
  assert.equal(walletKind('Savings Account'), 'savings');
});

// ---- Time ----

const time = timeFixture();

test('time entries: finished tasks are tracked, scheduled ones planned; blocked slots are deep work, meetings stay meetings', () => {
  assert.equal(categoryOf({ mode: 'blocked', type: 'ToDo' }), 'deep');
  assert.equal(categoryOf({ mode: 'blocked', type: 'Meeting' }), 'meetings');
  assert.equal(categoryOf({ mode: 'free', type: 'ToDo' }), 'todos');
  assert.equal(categoryOf({ mode: 'free', type: 'Errand' }), 'other');
  const base = { title: 't', type: 'ToDo', mode: 'free' as const, allDay: false, cancelled: false, projectId: null, areaId: null };
  const entries = timeEntries(
    [
      { ...base, id: 'a', start: new Date(2026, 8, 30, 9), end: new Date(2026, 8, 30, 10), done: true, completedAt: null, actualMinutes: 90 },
      { ...base, id: 'b', start: new Date(2026, 8, 30, 17), end: new Date(2026, 8, 30, 18), done: false, completedAt: null, actualMinutes: null },
      { ...base, id: 'c', start: null, end: null, done: true, completedAt: new Date(2026, 8, 30, 12), actualMinutes: 30 },
    ],
    [{ id: 'e', title: 'Call', start: new Date(2026, 8, 30, 13), end: new Date(2026, 8, 30, 14), allDay: false, focus: false, linked: false }],
    now
  );
  assert.equal(entries.find((e) => e.id === 'a')!.minutes, 90, 'actual minutes win');
  assert.equal(entries.find((e) => e.id === 'b')!.tracked, false);
  assert.equal(entries.find((e) => e.id === 'c')!.start.getHours(), 11, 'ends when it was finished');
  assert.equal(entries.find((e) => e.id === 'event-e')!.category, 'meetings');
  // Split at range edges: the 9:00 to 10:30 block puts 30 minutes in 10:00 to 11:00.
  assert.equal(trackedIn(entries, { start: new Date(2026, 8, 30, 10), end: new Date(2026, 8, 30, 11) }), 30);
  assert.equal(workdaysIn(new Date(2026, 8, 28), new Date(2026, 9, 5)), 5);
});

test('every Time period builds every card in its layout, with no long dashes', () => {
  for (const kind of DASH_KINDS as DashKind[]) {
    const p = buildPeriod(kind, now, now, new Date(2025, 8, 1));
    const ids = cardsIn(TIME_LAYOUT[kind]);
    const dash = timeDashboard(time, p, ids);
    assert.equal(dash.kpis.length, 6, kind);
    for (const id of ids) {
      const card = dash.cards[id as keyof typeof dash.cards];
      assert.ok(card, `${kind}: ${id}`);
      for (const text of [card.title, card.subtitle ?? '', card.insight ?? '', card.empty ?? '']) assert.doesNotMatch(text, LONG_DASH, `${kind} ${id}: ${text}`);
    }
  }
  const week = timeDashboard(time, buildPeriod('week', now, now), ['radar', 'hoursEach']);
  const radar = week.cards.radar;
  assert.ok(radar && radar.id === 'radar' && radar.axes.length === 4, 'areas with a weekly target');
  const hoursEach = week.cards.hoursEach;
  assert.ok(hoursEach && hoursEach.id === 'hoursEach' && hoursEach.data.filter((d) => d.parts === null).length === 4, 'Thursday to Sunday still to come');
});

// ---- Chart helpers and the page ----

test('chart helpers: box plot quartiles, labels pushed apart', () => {
  assert.deepEqual(boxStats([1, 2, 3, 4, 5]), { min: 1, q1: 2, median: 3, q3: 4, max: 5 });
  const spread = spreadLabels([10, 12, 13, 90]);
  for (let i = 1; i < spread.length; i++) assert.ok(spread[i] - spread[i - 1] >= 8.5 - 1e-9);
});

test('the page: Insights title and period filter on one fixed header row, every chart full width on a phone, a Linear / Log switch per chart', () => {
  const css = readFileSync(join(__dirname, '../app/src/widgets/Dashboard/Dashboard.module.css'), 'utf8');
  assert.match(css, /\.head \{\s*position: sticky;/);
  assert.match(css, /container-type: inline-size;/);
  assert.match(css, /@container dash \(max-width: 760px\)[\s\S]*\.grid > \* \{\s*grid-column: 1 \/ -1;/);
  assert.match(css, /\.head \{[^}]*justify-content: space-between;/, 'title left, filter right');
  const page = readFileSync(join(__dirname, '../app/src/widgets/Dashboard/DashboardPage.tsx'), 'utf8');
  assert.match(page, /<h1 className=\{s\.pageTitle\}>Insights<\/h1>/);
  for (const which of ['Money', 'Time']) assert.match(readFileSync(join(__dirname, `../app/src/screens/${which}Dashboard/${which}DashboardScreen.tsx`), 'utf8'), /^\s+web$/m, 'one title on web, beside the filters');
  assert.doesNotMatch(page, /aria-label="Dashboards"/, 'no Money / Time switch');
  const card = readFileSync(join(__dirname, '../app/src/widgets/Charts/ChartCard.tsx'), 'utf8');
  assert.match(card, /<ScaleSwitch mode=\{scale\} onChange=\{onScale\} \/>/);
  const money = readFileSync(join(__dirname, '../app/src/widgets/Dashboard/MoneyCards.tsx'), 'utf8');
  assert.match(money, /useState<ScaleMode>\('linear'\)/, 'each chart keeps its own scale');
});

test('specific periods: newest first, back to the first record, older days and weeks name their year', () => {
  const now = new Date(2026, 9, 11, 10);
  const months = periodChoices('month', now, new Date(2026, 6, 15));
  assert.deepEqual(months.map((m) => m.label), ['October 2026', 'September 2026', 'August 2026', 'July 2026']);
  assert.equal(months[1].value, '2026-09-01');
  const weeks = periodChoices('week', now, null);
  assert.equal(weeks.length, 104);
  assert.equal(weeks[0].value, '2026-10-05');
  assert.match(weeks[weeks.length - 1].label, / 2024$/);
  assert.deepEqual(periodChoices('all', now, null), []);
});
