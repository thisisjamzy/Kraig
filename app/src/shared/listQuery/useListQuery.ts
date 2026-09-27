'use client';

// One list's filter / sort / search state (engine.ts), saved per list per
// user: in settings/listViews (so it follows the user across devices),
// with a local copy so a return visit restores instantly. "Clear" resets
// to the list's own default. A screen may pass `override` (e.g. a bucket
// from the URL) to start from a specific setup instead of the saved one.

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { applyQuery, deserialize, serialize, type FieldDef, type ListQuery } from './engine';

const SAVE_DELAY_MS = 600;

function localKey(uid: string, listId: string) {
  return `dreda.list.${uid}.${listId}`;
}
function readLocal(uid: string | undefined, listId: string): ListQuery | null {
  if (!uid || typeof window === 'undefined') return null;
  try {
    return deserialize(localStorage.getItem(localKey(uid, listId)));
  } catch {
    return null;
  }
}

export function useListQuery<T>({
  listId,
  fields,
  defaults,
  override = null,
}: {
  listId: string;
  fields: FieldDef<T>[];
  defaults: ListQuery;
  override?: ListQuery | null;
}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [query, setQueryState] = useState<ListQuery | null>(null);
  const restoredFor = useRef<string | null>(null);

  // Restore once per user: the override, else the saved setup (local copy
  // first, then the synced one), else the default.
  useEffect(() => {
    if (!uid || restoredFor.current === uid) return;
    restoredFor.current = uid;
    if (override) {
      const frame = requestAnimationFrame(() => setQueryState(override));
      return () => cancelAnimationFrame(frame);
    }
    const local = readLocal(uid, listId);
    const frame = requestAnimationFrame(() => setQueryState(local ?? defaults));
    let cancelled = false;
    getDoc(doc(getFirebaseFirestore(), 'users', uid, 'settings', 'listViews'))
      .then((snap) => {
        const synced = deserialize(snap.data()?.[listId] as string | undefined);
        if (!cancelled && synced && !local) setQueryState(synced);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // Restoring happens once per user, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Save (debounced) whenever it changes.
  useEffect(() => {
    if (!uid || !query) return;
    const json = serialize(query);
    try {
      localStorage.setItem(localKey(uid, listId), json);
    } catch {
      // Storage blocked — the synced copy still saves.
    }
    const id = window.setTimeout(() => {
      setDoc(doc(getFirebaseFirestore(), 'users', uid, 'settings', 'listViews'), { [listId]: json }, { merge: true }).catch(
        () => undefined
      );
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [uid, listId, query]);

  const current = query ?? defaults;
  return {
    query: current,
    ready: query !== null,
    setQuery: (next: ListQuery | ((q: ListQuery) => ListQuery)) =>
      setQueryState((q) => (typeof next === 'function' ? next(q ?? defaults) : next)),
    clear: () => setQueryState(defaults),
    clearFilters: () => setQueryState((q) => ({ ...(q ?? defaults), filters: [], advanced: null, search: '' })),
    defaults,
    fields,
  };
}

/** Applies a list's query — memoised on the inputs. */
export function useQueried<T>(items: T[], fields: FieldDef<T>[], query: ListQuery): T[] {
  return useMemo(() => applyQuery(items, query, fields, new Date()), [items, fields, query]);
}
