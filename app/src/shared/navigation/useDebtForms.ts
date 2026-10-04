'use client';

// Opens a debt form: the side peek on medium screens and up, its own page
// on a phone. See debtForms.ts for the addresses.

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { DEBT_FORM_PARAM, DEBT_ID_PARAM, DEBT_PREFILL_PARAMS, debtFormPageHref, type DebtFormKind } from './debtForms';

export function useDebtForms() {
  const router = useRouter();
  const pathname = usePathname();
  const { isWide } = useLayout();

  const hrefFor = useCallback(
    (kind: DebtFormKind, debtId?: string | null, params?: Record<string, string>) => {
      if (!isWide) return debtFormPageHref(kind, debtId, params);
      const sp = new URLSearchParams(window.location.search);
      for (const p of DEBT_PREFILL_PARAMS) sp.delete(p);
      sp.set(DEBT_FORM_PARAM, kind);
      if (debtId) sp.set(DEBT_ID_PARAM, debtId);
      else sp.delete(DEBT_ID_PARAM);
      for (const [k, v] of Object.entries(params ?? {})) sp.set(k, v);
      return `${pathname}?${sp.toString()}`;
    },
    [isWide, pathname]
  );

  const open = useCallback(
    (kind: DebtFormKind, debtId?: string | null, params?: Record<string, string>) =>
      router.push(hrefFor(kind, debtId, params), isWide ? { scroll: false } : undefined),
    [router, hrefFor, isWide]
  );

  return { open, hrefFor };
}
