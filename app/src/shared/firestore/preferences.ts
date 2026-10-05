'use client';

// The person's preferences (Settings), stored at users/{uid}/settings/
// preferences. Each field is optional in Firestore; reads fill in the
// defaults below, so a household that never opened Settings behaves the
// same as before. Currency and time zone stay in settings/app, work hours
// and capacity in settings/insights, the savings target in settings/finance
// notification choices in settings/notifications and the plan's safety
// cushion in settings/planDraft (with the plan it belongs to).

import { useMemo } from 'react';
import { doc, setDoc, type DocumentReference } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export type DateFormat = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd';
export type TimeMode = 'blocked' | 'free';

export interface Preferences {
  /** Where the app opens, on wide screens and on a phone. */
  startPageWeb: string;
  startPagePhone: string;
  /** 1 = Monday, 0 = Sunday. */
  weekStartsOn: 0 | 1;
  dateFormat: DateFormat;
  /** Balances start hidden on Home. */
  hideAmounts: boolean;
  /** The app-open notifications prompt. */
  appOpenPrompt: boolean;
  /** The day a budget month starts (1 to 28). */
  monthStartDay: number;
  /** New basket items' automation and rollover. */
  automationDefault: 'off' | 'remind' | 'prepare';
  rolloverDefault: boolean;
  /** New tasks: length in minutes, and blocked or free per task type. */
  defaultTaskMinutes: number;
  timeModeByType: Record<string, TimeMode>;
  /** The wallet forms choose first. */
  defaultAccountId: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  startPageWeb: '/home',
  startPagePhone: '/home',
  weekStartsOn: 1,
  dateFormat: 'dd/mm/yyyy',
  hideAmounts: false,
  appOpenPrompt: true,
  monthStartDay: 1,
  automationDefault: 'off',
  rolloverDefault: false,
  defaultTaskMinutes: 60,
  timeModeByType: {},
  defaultAccountId: null,
};

/** The pages a start page can be. */
export const START_PAGES: { value: string; label: string }[] = [
  { value: '/home', label: 'Money home' },
  { value: '/budget', label: 'Budget' },
  { value: '/baskets', label: 'Baskets' },
  { value: '/projects/focus', label: 'Today' },
  { value: '/projects', label: 'Projects' },
];

export function preferencesRef(uid: string): DocumentReference<Partial<Preferences>> {
  return doc(getFirebaseFirestore(), 'users', uid, 'settings', 'preferences') as DocumentReference<Partial<Preferences>>;
}

/** Merges a change into the preferences document. */
export async function savePreferences(uid: string, patch: Partial<Preferences>): Promise<void> {
  await setDoc(preferencesRef(uid), patch, { merge: true });
}

/** The preferences, defaults filled in. */
export function usePreferences(): { prefs: Preferences; loading: boolean; uid: string | undefined } {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const ref = useMemo(() => (uid ? preferencesRef(uid) : null), [uid]);
  const { data, loading } = useFirestoreDoc<Partial<Preferences>>(ref);
  const prefs = useMemo(() => ({ ...DEFAULT_PREFERENCES, ...(data ?? {}) }) as Preferences, [data]);
  return { prefs, loading, uid };
}
