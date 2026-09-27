'use client';

// One page-specific action on the app bar (AppHeader), next to the bell —
// e.g. Planning's Edit / Plan new payment / Add transaction, which changes
// with its tab. A page registers it with useAppBarAction while mounted;
// the header shows whatever is registered, or nothing.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface AppBarAction {
  /** Changes when the action does (a new tab) — re-registers it. */
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
}

let current: AppBarAction | null = null;
const listeners = new Set<() => void>();

function set(next: AppBarAction | null) {
  current = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For AppHeader: the registered action, if any. */
export function useCurrentAppBarAction(): AppBarAction | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Puts `action` on the app bar while the calling page is mounted. */
export function useAppBarAction(action: AppBarAction | null) {
  // The latest click handler, without re-registering on every render.
  const onClick = useRef(action?.onClick);
  useEffect(() => {
    onClick.current = action?.onClick;
  });
  const key = action?.key ?? null;
  const label = action?.label;
  const icon = action?.icon;
  const href = action?.href;
  const clickable = Boolean(action?.onClick);
  useEffect(() => {
    if (!key || !label || !icon) return;
    set({ key, label, icon, href, onClick: clickable ? () => onClick.current?.() : undefined });
    return () => {
      if (current?.key === key) set(null);
    };
  }, [key, label, icon, href, clickable]);
}
