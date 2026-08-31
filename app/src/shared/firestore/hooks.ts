'use client';

// Generic live-read hooks (PRD-FIREBASE.md section 3: "mostly via live
// onSnapshot listeners, so the UI updates the instant a linked device
// writes something, no polling, no refetch button needed"). Every screen's
// useLogic composes these instead of talking to a server API.
//
// Important caller contract for useFirestoreCollection: pass a `Query`
// built with useMemo, keyed on whatever it actually depends on (e.g.
// `useMemo(() => query(collection(db, 'transactions'), where('month', '==',
// month)), [month])`). A fresh, unmemoized Query object on every render
// would resubscribe on every render — this hook trusts reference equality
// on the Query it's given rather than trying to deep-compare Firestore's
// internal query representation itself.

import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type DocumentReference,
  type FirestoreError,
  type Query,
} from 'firebase/firestore';

interface DocState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFirestoreDoc<T>(ref: DocumentReference | null): DocState<T> {
  const [state, setState] = useState<DocState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    return onSnapshot(
      ref,
      (snap) => {
        setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, loading: false, error: null });
      },
      (error: FirestoreError) => {
        setState({ data: null, loading: false, error: error.message });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return state;
}

/**
 * Like useFirestoreDoc, but for a doc whose fields ARE the whole payload
 * (e.g. statsBudgetProgress/{month}, a dynamic ruleId -> entry map) — does
 * NOT merge in `{id: snap.id}`, since useFirestoreDoc's convenience field
 * would otherwise land as a literal `id` key inside that map, indistinguishable
 * from a real ruleId (this bit a caller once: an "id" entry showed up in a
 * budget list, id being the doc's own id, e.g. "2026-08").
 */
export function useFirestoreMapDoc<T>(ref: DocumentReference | null): DocState<T> {
  const [state, setState] = useState<DocState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    return onSnapshot(
      ref,
      (snap) => {
        setState({ data: snap.exists() ? (snap.data() as T) : null, loading: false, error: null });
      },
      (error: FirestoreError) => {
        setState({ data: null, loading: false, error: error.message });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return state;
}

interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export function useFirestoreCollection<T>(q: Query | null): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    return onSnapshot(
      q,
      (snap) => {
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T),
          loading: false,
          error: null,
        });
      },
      (error: FirestoreError) => {
        setState({ data: [], loading: false, error: error.message });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return state;
}
