'use client';

// The sidebar's width (200 to 400px, default 240) and whether it's
// collapsed, per device class — remembered on this device. Expanded and
// large start open; medium starts collapsed (it opens as an overlay).

import { useCallback, useSyncExternalStore } from 'react';
import type { DeviceClass } from '@/src/styles/tokens/breakpoints';

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 240;

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function read(key: string, fallback: string): string {
  if (memory.has(key)) return memory.get(key)!;
  let value = fallback;
  try {
    value = window.localStorage.getItem(key) ?? fallback;
  } catch {
    // Storage blocked.
  }
  memory.set(key, value);
  return value;
}
function write(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // This session only.
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSidebarWidth(): [number, (px: number) => void] {
  const raw = useSyncExternalStore(subscribe, () => read('dreda.sidebar.width', String(SIDEBAR_DEFAULT)), () => String(SIDEBAR_DEFAULT));
  const width = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(raw) || SIDEBAR_DEFAULT));
  const set = useCallback((px: number) => write('dreda.sidebar.width', String(Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px))))), []);
  return [width, set];
}

export function useSidebarCollapsed(deviceClass: DeviceClass): [boolean, (collapsed: boolean) => void] {
  const key = `dreda.sidebar.collapsed.${deviceClass}`;
  const fallback = deviceClass === 'medium' || deviceClass === 'compact' ? 'true' : 'false';
  const raw = useSyncExternalStore(subscribe, () => read(key, fallback), () => 'true');
  const set = useCallback((collapsed: boolean) => write(key, String(collapsed)), [key]);
  return [raw === 'true', set];
}
