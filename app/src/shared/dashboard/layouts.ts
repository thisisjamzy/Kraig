// Which cards each dashboard shows in each period, in order, under which
// section headings, and how many of the 12 desktop columns each spans
// (Remix/Dashboard/dashboards-redesign.md, sections 8 and 9). Every view
// starts with the hero (4) and the KPI tiles (8); on a phone every chart is
// full width. Pages render from these lists, never one page per period.

import type { DashKind } from './period';

export type LayoutEntry = { section: string } | { card: string; span: number };

const sec = (section: string): LayoutEntry => ({ section });
const card = (id: string, span: number): LayoutEntry => ({ card: id, span });

// Untracked money (the reconciliation cards) always comes last.
const MONEY_REC = [sec('Untracked money'), card('recEach', 8), card('recWallet', 4), card('recLatest', 6), card('recRate', 6)];
const MONEY_FULL = [
  sec('Income'),
  card('incEach', 6),
  card('flow', 6),
  sec('Trends'),
  card('trend', 8),
  card('sav', 4),
  sec('Cash flow'),
  card('wf', 6),
  card('sk', 6),
  sec('Plan and debts'),
  card('plan', 7),
  card('debts', 5),
  sec('Unplanned spending'),
  card('tree', 6),
  card('when', 6),
  sec('Forecast'),
  card('fc', 12),
];

export const MONEY_LAYOUT: Record<DashKind, LayoutEntry[]> = {
  day: [sec('Today'), card('dayHours', 7), card('plan', 5), sec('Transactions'), card('dayTx', 12), sec('Untracked money'), card('recLatest', 12)],
  week: [
    sec('This week'),
    card('flow', 12),
    sec('Plan and cash flow'),
    card('plan', 6),
    card('wf', 6),
    sec('Unplanned spending'),
    card('tree', 6),
    card('when', 6),
    sec('Untracked money'),
    card('recEach', 6),
    card('recLatest', 6),
    card('recLog', 12),
  ],
  // Month adds the reconciliation log after the untracked money cards.
  month: [...MONEY_FULL, ...MONEY_REC, card('recLog', 12)],
  quarter: [...MONEY_FULL, ...MONEY_REC],
  year: [...MONEY_FULL, ...MONEY_REC],
  all: [
    sec('Income'),
    card('incEach', 6),
    card('flow', 6),
    sec('Trends'),
    card('trend', 8),
    card('sav', 4),
    sec('Cash flow'),
    card('wf', 6),
    card('sk', 6),
    sec('Spending and debts'),
    card('box', 7),
    card('debts', 5),
    sec('Unplanned spending'),
    card('tree', 6),
    card('when', 6),
    ...MONEY_REC,
  ],
};

// Time: the billable bubble chart is left out (no billable data).
const TIME_MONTH = [
  sec('Hours'),
  card('hoursEach', 8),
  card('donut', 4),
  sec('When and on what'),
  card('heat', 7),
  card('projects', 5),
  sec('Plan and trend'),
  card('plan', 6),
  card('trend', 6),
  sec('Projects and balance'),
  card('gantt', 8),
  card('radar', 4),
  sec('Patterns'),
  card('hist', 12),
  sec('Every day'),
  card('cal', 12),
];

export const TIME_LAYOUT: Record<DashKind, LayoutEntry[]> = {
  day: [sec('Today'), card('dayline', 8), card('donut', 4), sec('On what'), card('projects', 6), card('plan', 6)],
  week: [
    sec('This week'),
    card('hoursEach', 8),
    card('donut', 4),
    sec('When and on what'),
    card('heat', 7),
    card('projects', 5),
    sec('Plan and balance'),
    card('plan', 7),
    card('radar', 5),
    sec('Projects and focus'),
    card('gantt', 8),
    card('hist', 4),
  ],
  month: TIME_MONTH,
  quarter: TIME_MONTH,
  year: [
    sec('Hours'),
    card('hoursEach', 8),
    card('donut', 4),
    sec('When and on what'),
    card('heat', 7),
    card('projects', 5),
    sec('Trend and balance'),
    card('trend', 8),
    card('radar', 4),
    sec('Patterns'),
    card('hist', 12),
    sec('Every day'),
    card('cal', 12),
  ],
  all: [
    sec('Hours'),
    card('hoursEach', 8),
    card('donut', 4),
    sec('When and on what'),
    card('heat', 7),
    card('projects', 5),
    sec('Patterns'),
    card('box', 6),
    card('hist', 6),
    sec('Lifetime'),
    card('tree', 12),
    sec('Every day'),
    card('cal', 12),
  ],
};

/** The card ids a layout shows (sections left out). */
export const cardsIn = (layout: LayoutEntry[]) => layout.flatMap((e) => ('card' in e ? [e.card] : []));
