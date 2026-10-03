'use client';

// Hidden amounts: one switch for the whole app (the eye on Home's balance
// block), remembered on this device. Every amount drawn through <Money>
// (src/widgets/Money) or a database currency cell shows "••••••" while it's
// on: one style everywhere.

import { useSyncExternalStore } from 'react';

const KEY = 'dreda.amountsHidden';
// Home's older key, still honored once.
const OLD_KEY = 'balances-hidden';
export const HIDDEN_AMOUNT = '••••••';

let hidden: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (hidden !== null) return hidden;
  try {
    const v = localStorage.getItem(KEY);
    hidden = v === null ? localStorage.getItem(OLD_KEY) === '1' : v === '1';
  } catch {
    hidden = false;
  }
  return hidden;
}

export function setAmountsHidden(next: boolean) {
  hidden = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    // Not remembered; still applies until reload.
  }
  listeners.forEach((l) => l());
}

export function useAmountsHidden(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    read,
    () => false
  );
  return [value, setAmountsHidden];
}
