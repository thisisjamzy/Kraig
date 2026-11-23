'use client';

// One budget month's unaccounted money: the month's own figure from
// useAccountability (viewmodels/accountability.ts), so Budget, Available
// now, Home and Add transaction all read the same definition.

import { useAccountability } from '@/src/shared/hooks/useAccountability';
import type { MonthUnaccounted } from '@/src/shared/budget/unaccounted';

export function useMonthUnaccounted(
  month: string | null
): MonthUnaccounted & { loading: boolean; lastCheckAt: Date | null; outflow: number; rate: number | null; name: string } {
  const { current, loading } = useAccountability({ period: 'month', count: 1, month });
  return {
    checks: current?.checks ?? 0,
    recorded: current?.recorded ?? 0,
    explained: current?.explained ?? 0,
    unaccounted: current?.unaccounted ?? 0,
    outflow: current?.outflow ?? 0,
    rate: current?.rate ?? null,
    name: current?.name ?? '',
    lastCheckAt: current?.lastCheckAt ?? null,
    loading,
  };
}
