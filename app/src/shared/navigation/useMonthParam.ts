'use client';

// The month a page shows, kept in its URL (?month=YYYY-MM, replaced in
// place) so coming back lands on the same month. Defaults to this month.

import { useState } from 'react';
import { URL_EVENT } from './locationSearch';

function current() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fromUrl(): string {
  if (typeof window === 'undefined') return current();
  const raw = new URLSearchParams(window.location.search).get('month');
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : current();
}

export function useMonthParam(): [string, (month: string) => void] {
  const [month, setMonthState] = useState(fromUrl);
  function setMonth(next: string) {
    setMonthState(next);
    const params = new URLSearchParams(window.location.search);
    params.set('month', next);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new Event(URL_EVENT));
  }
  return [month, setMonth];
}

/** A query parameter's value, read once. */
export function useSearchParamOnce(name: string): string | null {
  const [value] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name)));
  return value;
}
