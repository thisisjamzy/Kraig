'use client';

// The transactions list — the Notion-style filter / sort / search toolbar
// (pinned under the header), money in / money out / count for what's
// listed, then the rows: grouped by day with each day's net while the
// primary sort is by date, one flat list otherwise. Planning's History tab
// (one month) and the all-transactions page both render exactly this.

import { useMemo } from 'react';
import type { HistoryRow } from '@/src/logic/planning/rows';
import { groupByDay } from '@/src/logic/planning/rows';
import { applyQuery, type FieldDef } from '@/src/shared/listQuery/engine';
import type { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { money, signedMoney, weekdayDayMonth } from '@/src/viewmodels/planning';
import { round2 } from '@/src/shared/firestore/currency';
import { HistoryRowView } from './PlanningParts';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { HistoryTable } from './HistoryTable';
import styles from './Planning.module.css';
import tab from './PlanningTabs.module.css';

export function HistoryView({
  rows,
  currency,
  fields,
  list,
  stickyTop,
  emptyText,
  showYear = false,
  onClear,
}: {
  rows: HistoryRow[];
  currency: string;
  fields: FieldDef<HistoryRow>[];
  list: ReturnType<typeof useListQuery<HistoryRow>>;
  stickyTop: string;
  emptyText: string;
  /** Day headers with the year (lists that span years). */
  showYear?: boolean;
  /** Extra clean-up when the list is cleared (e.g. a bucket in the URL). */
  onClear?: () => void;
}) {
  const { query } = list;
  // Expanded and large screens: a sortable table instead of the cards.
  const { deviceClass } = useLayout();
  const asTable = deviceClass === 'expanded' || deviceClass === 'large';
  const shown = useMemo(() => applyQuery(rows, query, fields, new Date()), [rows, query, fields]);
  const byDate = query.sorts[0]?.field === 'date';
  const groups = byDate ? groupByDay(shown) : null;
  const totals = {
    in: round2(shown.filter((r) => r.kind === 'transaction' && r.amount > 0).reduce((s, r) => s + r.amount, 0)),
    out: round2(-shown.filter((r) => r.kind === 'transaction' && r.amount < 0).reduce((s, r) => s + r.amount, 0)),
    // Budget moves are listed but aren't transactions.
    count: shown.filter((r) => r.kind !== 'adjustment').length,
  };

  return (
    <>
      <ListQueryBar
        fields={fields}
        query={query}
        setQuery={list.setQuery}
        onClear={() => {
          list.clear();
          onClear?.();
        }}
        count={shown.length}
        noun={['transaction', 'transactions']}
        stickyTop={stickyTop}
      />

      <section className={tab.strip3} aria-label="In numbers">
        <div>
          <span>Money in</span>
          <strong>{money(totals.in)}</strong>
        </div>
        <div>
          <span>Money out</span>
          <strong>{money(totals.out)}</strong>
        </div>
        <div>
          <span>Transactions</span>
          <strong>{totals.count}</strong>
        </div>
      </section>

      {rows.length === 0 ? (
        <p className={`${styles.empty} ${tab.listGap}`}>{emptyText}</p>
      ) : shown.length === 0 ? (
        <ListQueryEmpty
          onClear={() => {
            list.clearFilters();
            onClear?.();
          }}
        />
      ) : asTable ? (
        <HistoryTable rows={shown} fields={fields} query={query} setQuery={list.setQuery} currency={currency} />
      ) : groups ? (
        groups.map((g) => (
          <section key={g.key} className={tab.dayGroup}>
            <header className={tab.dayHead}>
              <span>
                {weekdayDayMonth(g.date)}
                {showYear && g.date.getFullYear() !== new Date().getFullYear() ? ` ${g.date.getFullYear()}` : ''}
              </span>
              <span>
                {signedMoney(Math.round(g.net * 100) / 100)} {currency}
              </span>
            </header>
            <div className={styles.rows}>
              {g.rows.map((row) => (
                <HistoryRowView key={`${row.kind}-${row.id}`} row={row} currency={currency} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className={`${styles.rows} ${tab.listGap}`}>
          {shown.map((row) => (
            <HistoryRowView key={`${row.kind}-${row.id}`} row={row} currency={currency} showDate />
          ))}
        </div>
      )}
    </>
  );
}
