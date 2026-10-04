'use client';

// Transactions as a real table — expanded and large screens only
// (HistoryView keeps the phone's card list below that). Columns: date,
// name, bucket, category, payment method, amount. The sortable headers
// drive the same sort as the toolbar's sort menu (the shared list query),
// so the two never disagree. The header row sticks under the top bar;
// a row opens the transaction.

import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { HistoryRow } from '@/src/logic/planning/rows';
import type { FieldDef, ListQuery } from '@/src/shared/listQuery/engine';
import { money } from '@/src/viewmodels/planning';
import styles from '@/src/phone/screens/Planning/HistoryTable.module.css';

const COLUMNS: { field: string; label: string; numeric?: boolean }[] = [
  { field: 'date', label: 'Date' },
  { field: 'name', label: 'Name' },
  { field: 'bucket', label: 'Basket' },
  { field: 'category', label: 'Category' },
  { field: 'method', label: 'Payment method' },
  { field: 'amount', label: 'Amount', numeric: true },
];

function optionLabel(fields: FieldDef<HistoryRow>[], field: string, value: string | null) {
  if (!value) return '';
  return fields.find((f) => f.id === field)?.options?.find((o) => o.value === value)?.label ?? '';
}

export function HistoryTable({
  rows,
  fields,
  query,
  setQuery,
  currency,
}: {
  rows: HistoryRow[];
  fields: FieldDef<HistoryRow>[];
  query: ListQuery;
  setQuery: (next: (q: ListQuery) => ListQuery) => void;
  currency: string;
}) {
  const primary = query.sorts[0];

  function sortBy(field: string) {
    setQuery((q) => {
      const current = q.sorts[0];
      const dir: 'asc' | 'desc' = current?.field === field ? (current.dir === 'asc' ? 'desc' : 'asc') : field === 'date' || field === 'amount' ? 'desc' : 'asc';
      return { ...q, sorts: [{ id: `table-${field}`, field, dir }, ...q.sorts.filter((s) => s.field !== field).slice(0, 2)] };
    });
  }

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const sorted = primary?.field === c.field ? primary.dir : null;
              const sortable = fields.find((f) => f.id === c.field)?.sortable !== false;
              return (
                <th
                  key={c.field}
                  scope="col"
                  data-numeric={c.numeric || undefined}
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                >
                  {sortable ? (
                    <button type="button" className={styles.sort} onClick={() => sortBy(c.field)}>
                      {c.label}
                      {sorted === 'asc' && <ArrowUp size={13} strokeWidth={2.5} aria-hidden />}
                      {sorted === 'desc' && <ArrowDown size={13} strokeWidth={2.5} aria-hidden />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`} className={styles.row}>
              <td className={styles.date}>
                {r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {r.timeKnown !== false && (
                  <span className={styles.time}>{r.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </td>
              <td className={styles.name}>
                {/* The whole row is clickable through this link's ::after. */}
                <Link href={r.href} className={styles.rowLink}>
                  {r.name}
                </Link>
                {r.note && r.note !== r.name && <span className={styles.note}>{r.note}</span>}
              </td>
              <td>{r.bucketName ? <span className={styles.chip}>{r.bucketName}</span> : <span className={styles.none}></span>}</td>
              <td>{optionLabel(fields, 'category', r.categoryId) || <span className={styles.none}></span>}</td>
              <td>{r.method || <span className={styles.none}></span>}</td>
              <td className={styles.amount} data-numeric data-flow={r.flow}>
                {r.kind === 'transaction' && r.amount > 0 ? '+' : r.kind === 'transaction' ? '−' : ''}
                {money(Math.abs(r.amount))} <span className={styles.currency}>{currency}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
