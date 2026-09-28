'use client';

// Opening a task (or a new one) — a full page on phones, as always; on
// medium screens and up, the side panel over the current page, with the
// URL saying so (/projects/focus?task=abc), so links and Back work on every
// size. PanelHost (src/widgets/AppShell) renders the panel from the URL,
// and sends a phone that opens such a link to the full page instead.
//
// New-task prefill uses the same query names the task form already reads
// (date, type, projectId, quadrant), so the form works unchanged.

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';

export const TASK_PARAM = 'task';
export const PREFILL_PARAMS = ['date', 'type', 'projectId', 'quadrant', 'start', 'end'];

function query(params: Record<string, string> | undefined) {
  const sp = new URLSearchParams(params);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** The full-page address — what a phone always uses. */
export function taskPageHref(id: string | 'new', params?: Record<string, string>) {
  return id === 'new' ? `/tasks/new${query(params)}` : `/tasks/${id}/edit`;
}

export function useTaskPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { isWide } = useLayout();

  const hrefFor = useCallback(
    (id: string | 'new', params?: Record<string, string>) => {
      if (!isWide) return taskPageHref(id, params);
      const sp = new URLSearchParams(window.location.search);
      for (const p of PREFILL_PARAMS) sp.delete(p);
      sp.set(TASK_PARAM, id);
      for (const [k, v] of Object.entries(params ?? {})) sp.set(k, v);
      return `${pathname}?${sp.toString()}`;
    },
    [isWide, pathname]
  );

  const open = useCallback(
    (id: string | 'new', params?: Record<string, string>) =>
      // A phone navigates exactly as it always did.
      isWide ? router.push(hrefFor(id, params), { scroll: false }) : router.push(hrefFor(id, params)),
    [router, hrefFor, isWide]
  );

  return { hrefFor, open, isPanel: isWide };
}

/** The current URL without the panel (and a new task's prefill). */
export function withoutTaskPanel(pathname: string, search: string): string {
  const sp = new URLSearchParams(search);
  const wasNew = sp.get(TASK_PARAM) === 'new';
  sp.delete(TASK_PARAM);
  if (wasNew) for (const p of PREFILL_PARAMS) sp.delete(p);
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}
