// The transactions list's filter and sort fields (the Notion-style
// toolbar, src/widgets/ListQuery) — shared by Planning's History tab
// (within the selected month) and the all-transactions page.

import type { FieldDef, ListQuery } from '@/src/shared/listQuery/engine';
import type { HistoryRow } from './rows';

const DIRECTION = { Income: 'income', Expense: 'expense', Savings: 'savings', Transfer: 'transfer' } as const;

export function transactionFields({
  buckets,
  categories,
  accounts,
}: {
  buckets: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
}): FieldDef<HistoryRow>[] {
  const byName = <X extends { name: string }>(list: X[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  return [
    { id: 'name', label: 'Name', type: 'text', get: (r) => r.name, searchable: true },
    { id: 'note', label: 'Note', type: 'text', get: (r) => r.note, searchable: true },
    { id: 'amount', label: 'Amount', type: 'currency', get: (r) => Math.abs(r.amount) },
    {
      id: 'direction',
      label: 'Direction',
      type: 'select',
      get: (r) => DIRECTION[r.type],
      options: [
        { value: 'income', label: 'Income', color: '#2fa36b' },
        { value: 'expense', label: 'Expense', color: '#e04b5a' },
        { value: 'savings', label: 'Savings', color: '#d98a1c' },
        { value: 'transfer', label: 'Transfer', color: '#3b63f0' },
      ],
    },
    {
      id: 'bucket',
      label: 'Bucket',
      type: 'select',
      get: (r) => r.bucketId,
      options: byName(buckets).map((b) => ({ value: b.id, label: b.name })),
      searchable: false,
    },
    {
      id: 'category',
      label: 'Category',
      type: 'select',
      get: (r) => r.categoryId,
      options: byName(categories).map((c) => ({ value: c.id, label: c.name })),
    },
    {
      id: 'method',
      label: 'Payment method',
      type: 'select',
      get: (r) => r.accountIds[0] ?? null,
      options: byName(accounts).map((a) => ({ value: a.id, label: a.name })),
    },
    { id: 'date', label: 'Date', type: 'date', get: (r) => r.date },
    { id: 'assigned', label: 'Assigned to bucket', type: 'checkbox', get: (r) => r.bucketId !== null, sortable: false },
    // Searched too, without being a filter of its own.
    { id: 'methodName', label: 'Wallet', type: 'text', get: (r) => r.method, searchable: true, filterable: false, sortable: false },
  ];
}

/** Newest first, no filters (the month selector scopes the History tab). */
export const TRANSACTION_DEFAULTS: ListQuery = {
  filters: [],
  advanced: null,
  sorts: [{ id: 'default-date', field: 'date', dir: 'desc' }],
  search: '',
};
