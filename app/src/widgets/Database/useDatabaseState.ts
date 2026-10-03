'use client';

// A database's view state, remembered per database on this device: the
// open view and the household's saved views, column widths, order and
// visibility, grouping and collapsed groups, footer calculations, the
// properties cards show, and each view's own filters, sorts and search.

import { useEffect, useState } from 'react';
import { EMPTY_QUERY, type ListQuery } from '@/src/shared/listQuery/engine';
import type { Calc, DatabaseState, SavedView } from './types';

const KEY = (id: string) => `dreda.db.${id}`;

function read(id: string): Partial<DatabaseState> | null {
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) ?? 'null');
  } catch {
    return null;
  }
}

export function useDatabaseState(id: string, defaults: { view: string; group: string }) {
  const initial: DatabaseState = {
    view: defaults.view,
    saved: [],
    widths: {},
    hidden: null,
    order: [],
    group: defaults.group,
    collapsed: [],
    calcs: {},
    cardProps: null,
    queries: {},
  };
  const [state, setState] = useState<DatabaseState>(initial);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Restore after mount (localStorage isn't there on the server).
  useEffect(() => {
    const stored = read(id);
    const frame = requestAnimationFrame(() => {
      setState((s) => ({ ...s, ...(stored ?? {}) }));
      setLoadedFor(id);
    });
    return () => cancelAnimationFrame(frame);
  }, [id]);

  useEffect(() => {
    if (loadedFor !== id) return;
    try {
      localStorage.setItem(KEY(id), JSON.stringify(state));
    } catch {
      // Not remembered on this device.
    }
  }, [id, state, loadedFor]);

  const patch = (next: Partial<DatabaseState> | ((s: DatabaseState) => Partial<DatabaseState>)) =>
    setState((s) => ({ ...s, ...(typeof next === 'function' ? next(s) : next) }));

  const query = state.queries[state.view] ?? EMPTY_QUERY;

  return {
    state,
    patch,
    query,
    setQuery: (next: ListQuery | ((q: ListQuery) => ListQuery)) =>
      patch((s) => {
        const current = s.queries[s.view] ?? EMPTY_QUERY;
        return { queries: { ...s.queries, [s.view]: typeof next === 'function' ? next(current) : next } };
      }),
    clearQuery: () => patch((s) => ({ queries: { ...s.queries, [s.view]: EMPTY_QUERY } })),
    setWidth: (column: string, width: number) => patch((s) => ({ widths: { ...s.widths, [column]: width } })),
    setCalc: (column: string, calc: Calc) => patch((s) => ({ calcs: { ...s.calcs, [column]: calc } })),
    toggleGroup: (key: string) =>
      patch((s) => ({ collapsed: s.collapsed.includes(key) ? s.collapsed.filter((k) => k !== key) : [...s.collapsed, key] })),
    addView: (view: SavedView) => patch((s) => ({ saved: [...s.saved, view], view: view.id })),
    removeView: (viewId: string) =>
      patch((s) => ({ saved: s.saved.filter((v) => v.id !== viewId), view: s.view === viewId ? defaults.view : s.view })),
  };
}

export type DatabaseStateApi = ReturnType<typeof useDatabaseState>;

/** Notion's peek modes, remembered for every database. */
export type PeekMode = 'side' | 'center' | 'full';
const PEEK_KEY = 'dreda.db.peek';

export function readPeekMode(): PeekMode {
  try {
    const value = localStorage.getItem(PEEK_KEY);
    return value === 'center' || value === 'full' ? value : 'side';
  } catch {
    return 'side';
  }
}

export function writePeekMode(mode: PeekMode) {
  try {
    localStorage.setItem(PEEK_KEY, mode);
  } catch {
    // Not remembered.
  }
}
