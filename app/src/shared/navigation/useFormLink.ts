'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { formPageHref, formPeekHref, type FormKind } from './formPeek';

/**
 * Where a "New ..." or "Edit" link should go: a side peek over this page on
 * medium screens and up, the form's own page on a phone (formPeek.ts).
 */
export function useFormLink() {
  const { isWide } = useLayout();
  const pathname = usePathname() ?? '/';
  return useCallback(
    (kind: FormKind, params: Record<string, string | null | undefined> = {}) =>
      isWide ? formPeekHref(pathname, typeof window === 'undefined' ? '' : window.location.search, kind, params) : formPageHref(kind, params),
    [isWide, pathname]
  );
}
