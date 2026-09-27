'use client';

// Planning > History — "where did my money go?": the month's transactions
// and transfers, in the shared transactions list (HistoryView).

import { useHistoryTab } from '@/src/logic/planning/useHistoryTab';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { HistoryView } from './HistoryView';

// Pinned under the app bar.
const STICKY_TOP = 'calc(68px + env(safe-area-inset-top))';

export function HistoryTab({
  month,
  data,
  bucket,
  setBucket,
}: {
  month: string;
  data: PlanningData;
  bucket: string | null;
  setBucket: (bucket: string | null) => void;
}) {
  const { rows, currency, fields, list } = useHistoryTab(month, data, bucket);
  return (
    <HistoryView
      rows={rows}
      currency={currency}
      fields={fields}
      list={list}
      stickyTop={STICKY_TOP}
      emptyText="No transactions recorded this month."
      onClear={() => setBucket(null)}
    />
  );
}
