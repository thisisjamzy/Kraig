'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { settingsHref, settingsPageHref } from './settingsLink';

/** A link to a Settings section: the dialog over this page on wide screens, its own page on a phone. */
export function useSettingsLink() {
  const { isWide } = useLayout();
  const pathname = usePathname() ?? '/';
  return useCallback(
    (section = 'preferences') =>
      isWide ? settingsHref(pathname, typeof window === 'undefined' ? '' : window.location.search, section) : settingsPageHref(section),
    [isWide, pathname]
  );
}
