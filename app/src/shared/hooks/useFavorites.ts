'use client';

// Favorites: pages, buckets or projects the household starred, in the
// sidebar's "Favorites" section. Stored in settings/favorites so they
// follow the user across devices.

import { useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useFirebaseUser } from './useFirebaseUser';

export interface Favorite {
  href: string;
  label: string;
  /** For the icon: a tree page id, 'bucket' or 'project'. */
  kind: string;
}

export function useFavorites() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const ref = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'favorites') : null), [uid]);
  const { data } = useFirestoreDoc<{ items?: Favorite[] }>(ref);
  const items = useMemo(() => data?.items ?? [], [data]);

  async function save(next: Favorite[]) {
    if (!ref) return;
    await setDoc(ref, { items: next }, { merge: true });
  }

  return {
    items,
    isFavorite: (href: string) => items.some((f) => f.href === href),
    toggle: (favorite: Favorite) =>
      save(items.some((f) => f.href === favorite.href) ? items.filter((f) => f.href !== favorite.href) : [...items, favorite]),
    remove: (href: string) => save(items.filter((f) => f.href !== href)),
  };
}
