'use client';

// The current page's metadata, set by the page while it's mounted and read
// by the shell: its breadcrumb ("Money / Buckets / Running Douala"), whether
// the page draws its own title (so the shell doesn't add one), and a key
// for page-level preferences (Favorites, full or standard width).

import { useEffect, useSyncExternalStore } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageMeta {
  crumbs: Crumb[] | null;
  /** The page draws its own title in its body. */
  titled: boolean;
}

// A stack: the latest mounted page (or peek) wins; unmounting restores
// whatever was there before it.
const crumbStack: { id: number; crumbs: Crumb[] }[] = [];
let titleOwners = 0;
let nextId = 1;
let current: PageMeta = { crumbs: null, titled: false };
const listeners = new Set<() => void>();

function publish() {
  current = { crumbs: crumbStack.at(-1)?.crumbs ?? null, titled: crumbStack.length > 0 || titleOwners > 0 };
  listeners.forEach((l) => l());
}

/** Sets the breadcrumb; a page that calls this draws its own title too. */
export function useBreadcrumb(crumbs: Crumb[] | null) {
  const key = crumbs ? JSON.stringify(crumbs) : '';
  useEffect(() => {
    if (!key) return;
    const entry = { id: nextId++, crumbs: JSON.parse(key) as Crumb[] };
    crumbStack.push(entry);
    publish();
    return () => {
      const i = crumbStack.findIndex((e) => e.id === entry.id);
      if (i >= 0) crumbStack.splice(i, 1);
      publish();
    };
  }, [key]);
}

/** For a page that draws its own title without setting a breadcrumb. */
export function useOwnsTitle(owns: boolean) {
  useEffect(() => {
    if (!owns) return;
    titleOwners += 1;
    publish();
    return () => {
      titleOwners -= 1;
      publish();
    };
  }, [owns]);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePageMeta(): PageMeta {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export function useCurrentBreadcrumb(): Crumb[] | null {
  return usePageMeta().crumbs;
}

// ---- Page width (Notion's "Full width"), remembered per page ----

export type PageWidth = 'full' | 'standard';
const widthListeners = new Set<() => void>();
const WIDTH_KEY = 'dreda.pageWidth';
let widths: Record<string, PageWidth> | null = null;

function readWidths(): Record<string, PageWidth> {
  if (widths) return widths;
  try {
    widths = JSON.parse(localStorage.getItem(WIDTH_KEY) ?? '{}');
  } catch {
    widths = {};
  }
  return widths!;
}

export function setPageWidth(path: string, width: PageWidth) {
  widths = { ...readWidths(), [path]: width };
  try {
    localStorage.setItem(WIDTH_KEY, JSON.stringify(widths));
  } catch {
    // Not remembered.
  }
  widthListeners.forEach((l) => l());
}

/** Full width unless the household chose Standard for this page. */
export function usePageWidth(path: string | null, fallback: PageWidth = 'full'): PageWidth {
  return useSyncExternalStore(
    (l) => {
      widthListeners.add(l);
      return () => widthListeners.delete(l);
    },
    () => (path ? (readWidths()[path] ?? fallback) : fallback),
    () => fallback
  );
}
