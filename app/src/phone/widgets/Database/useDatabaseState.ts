'use client';

// A database's views, remembered per database on this device: which view
// is open, and each view's own layout, filters, sorts and search,
// properties (shown, hidden, order, widths), grouping, calculations, card
// and table options and load limit. Changing one view never touches
// another (hiding "Next due" on Cards leaves Table alone).

import { useEffect, useState } from 'react';
import { EMPTY_QUERY, newId, type ListQuery } from '@/src/shared/listQuery/engine';
import type { Calc, DefaultView, ViewConfig } from '@/src/phone/widgets/Database/types';

const KEY = (id: string) => `dreda.db2.${id}`;

interface Stored {
  active: string;
  views: ViewConfig[];
}

export function blankView(
  base: { id: string; name: string; layout: ViewConfig['layout']; basedOn?: string | null; group?: string; hidden?: string[] | null },
  group: string
): ViewConfig {
  return {
    id: base.id,
    name: base.name,
    layout: base.layout,
    basedOn: base.basedOn ?? null,
    query: EMPTY_QUERY,
    hidden: base.hidden ?? null,
    order: [],
    widths: {},
    group: base.group ?? group,
    hideEmptyGroups: true,
    collapsed: [],
    calcs: {},
    cardSize: 'medium',
    cardPreview: 'progress',
    fitProperties: 'wrap',
    wrapCells: false,
    rowNumbers: false,
    freezeFirst: true,
    limit: 50,
    sortPreset: null,
  };
}

function read(id: string): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) ?? 'null');
  } catch {
    return null;
  }
}

export function useDatabaseState<T>(id: string, defaults: DefaultView<T>[], defaultGroup: string, defaultSortPreset: string | null = null) {
  const initial = (): Stored => ({
    active: defaults[0]?.id ?? 'table',
    views: defaults.map((d) => ({ ...blankView({ ...d, basedOn: d.id }, defaultGroup), sortPreset: defaultSortPreset })),
  });
  const [state, setState] = useState<Stored>(initial);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Restore after mount (localStorage isn't there on the server); default
  // views added to the code later appear for everyone.
  useEffect(() => {
    const stored = read(id);
    const frame = requestAnimationFrame(() => {
      if (stored?.views?.length) {
        const missing = defaults.filter((d) => !stored.views.some((v) => v.basedOn === d.id || v.id === d.id));
        const views = [
          ...stored.views.map((v) => ({ ...blankView(v, defaultGroup), ...v })),
          ...missing.map((d) => ({ ...blankView({ ...d, basedOn: d.id }, defaultGroup), sortPreset: defaultSortPreset })),
        ];
        setState({ active: views.some((v) => v.id === stored.active) ? stored.active : views[0].id, views });
      }
      setLoadedFor(id);
    });
    return () => cancelAnimationFrame(frame);
    // Restoring happens once per database id, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (loadedFor !== id) return;
    try {
      localStorage.setItem(KEY(id), JSON.stringify(state));
    } catch {
      // Not remembered on this device.
    }
  }, [id, state, loadedFor]);

  const view = state.views.find((v) => v.id === state.active) ?? state.views[0];

  const patchView = (next: Partial<ViewConfig> | ((v: ViewConfig) => Partial<ViewConfig>)) =>
    setState((s) => ({
      ...s,
      views: s.views.map((v) => (v.id === s.active ? { ...v, ...(typeof next === 'function' ? next(v) : next) } : v)),
    }));

  return {
    view,
    views: state.views,
    patchView,
    select: (viewId: string) => setState((s) => ({ ...s, active: viewId })),
    setQuery: (next: ListQuery | ((q: ListQuery) => ListQuery)) => patchView((v) => ({ query: typeof next === 'function' ? next(v.query) : next })),
    clearQuery: () => patchView({ query: EMPTY_QUERY }),
    setWidth: (column: string, width: number) => patchView((v) => ({ widths: { ...v.widths, [column]: width } })),
    setCalc: (column: string, calc: Calc) => patchView((v) => ({ calcs: { ...v.calcs, [column]: calc } })),
    toggleGroup: (key: string) => patchView((v) => ({ collapsed: v.collapsed.includes(key) ? v.collapsed.filter((k) => k !== key) : [...v.collapsed, key] })),
    addView: (name: string, layout: ViewConfig['layout']) =>
      setState((s) => {
        const viewId = newId('v');
        const from = s.views.find((v) => v.id === s.active)!;
        return { active: viewId, views: [...s.views, { ...from, id: viewId, name, layout, collapsed: [] }] };
      }),
    duplicateView: (viewId: string) =>
      setState((s) => {
        const from = s.views.find((v) => v.id === viewId);
        if (!from) return s;
        const copy = { ...from, id: newId('v'), name: `${from.name} copy` };
        return { active: copy.id, views: [...s.views, copy] };
      }),
    renameView: (viewId: string, name: string) => setState((s) => ({ ...s, views: s.views.map((v) => (v.id === viewId ? { ...v, name } : v)) })),
    deleteView: (viewId: string) =>
      setState((s) => {
        if (s.views.length <= 1) return s;
        const views = s.views.filter((v) => v.id !== viewId);
        return { active: s.active === viewId ? views[0].id : s.active, views };
      }),
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
