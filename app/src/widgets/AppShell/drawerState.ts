'use client';

// The side drawer's state, remembered per device class (localStorage,
// wrapped — private windows and blocked storage just use the defaults).
//   full    256px, icons and labels — default on expanded and large
//   rail    80px, icons only — default on medium
//   hidden  gone; the top bar's menu button opens it as an overlay
// Medium can't hold a full drawer beside its content, so a "full" there is
// shown as the overlay instead; the preference saved for larger screens is
// never touched by what a smaller window does.

import { useCallback, useSyncExternalStore } from 'react';
import type { DeviceClass } from '@/src/styles/tokens/breakpoints';

export type DrawerState = 'full' | 'rail' | 'hidden';

const DEFAULTS: Record<Exclude<DeviceClass, 'compact'>, DrawerState> = {
  medium: 'rail',
  expanded: 'full',
  large: 'full',
};
const key = (c: DeviceClass) => `dreda.drawer.${c}`;

const listeners = new Set<() => void>();
const memory = new Map<string, DrawerState>();

function readPref(c: DeviceClass): DrawerState {
  if (c === 'compact') return 'hidden';
  const k = key(c);
  if (memory.has(k)) return memory.get(k)!;
  let value: DrawerState = DEFAULTS[c];
  try {
    const stored = window.localStorage.getItem(k);
    if (stored === 'full' || stored === 'rail' || stored === 'hidden') value = stored;
  } catch {
    // Storage blocked — defaults.
  }
  memory.set(k, value);
  return value;
}

function writePref(c: DeviceClass, value: DrawerState) {
  if (c === 'compact') return;
  memory.set(key(c), value);
  try {
    window.localStorage.setItem(key(c), value);
  } catch {
    // Remembered for this session only.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The saved state for this device class, and a setter. Medium's "full"
 * is rendered as the overlay by the shell. */
export function useDrawerPref(deviceClass: DeviceClass): [DrawerState, (next: DrawerState) => void] {
  const state = useSyncExternalStore(
    subscribe,
    () => readPref(deviceClass),
    () => 'hidden' as DrawerState
  );
  const set = useCallback((next: DrawerState) => writePref(deviceClass, next), [deviceClass]);
  return [state, set];
}
