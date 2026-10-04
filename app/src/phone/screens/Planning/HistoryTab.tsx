'use client';

// Planning > History — "where did my money go?": the month's transactions
// and transfers, in the shared transactions list (HistoryView).

import { useHistoryTab } from '@/src/logic/planning/useHistoryTab';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { HistoryView } from '@/src/phone/screens/Planning/HistoryView';

// Pinned under the app bar.
const STICKY_TOP = 'var(--header-height)';

export function HistoryTab({
  month,
  data,
  bucket,
  category,
  onClearFilters,
}: {
  month: string;
  data: PlanningData;
  bucket: string | null;
  category: string | null;
  onClearFilters: () => void;
}) {
  const { rows, currency, fields, list } = useHistoryTab(month, data, bucket, category);
  return (
    <HistoryView
      rows={rows}
      currency={currency}
      fields={fields}
      list={list}
      stickyTop={STICKY_TOP}
      emptyText="No transactions recorded this month."
      onClear={onClearFilters}
    />
  );
}
