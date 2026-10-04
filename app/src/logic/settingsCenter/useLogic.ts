'use client';

// Settings: every section's data and changes, for the web dialog and the
// phone's section pages alike (src/settings). It brings together what lives
// elsewhere rather than copying it: the currency and sign-out of
// src/logic/settings, the theme provider, the preferences document,
// notification choices, work hours (settings/insights), the savings target
// (settings/finance), the plan's cushion (settings/planDraft), Google
// Calendar (src/logic/googleCalendarSettings) and the accounts. Every change
// saves at once and says "Saved".

import { useContext, useMemo, useState } from 'react';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { accountRef, financeSettingsRef, insightsSettingsRef, settingsRef, taskTypesRef } from '@/src/shared/firestore/refs';
import { useAccounts } from '@/src/shared/firestore/queries';
import { savePreferences, usePreferences, type Preferences } from '@/src/shared/firestore/preferences';
import { saveNotificationPrefs, setTypeChannel, setTypeMuted } from '@/src/shared/firestore/notificationWrites';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { notificationPermission, requestNotificationPermission } from '@/src/shared/insights/notify';
import { ThemeContext } from '@/src/shared/components/ThemeProvider/ThemeProvider';
import { useLogic as useAccountSettings } from '@/src/logic/settings/useLogic';
import { useLogic as useCalendarSettings } from '@/src/logic/googleCalendarSettings/useLogic';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { TASK_TYPES } from '@/src/viewmodels/projects';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { Appearance } from '@/src/shared/types/theme';
import type { NotificationType } from '@/src/shared/notifications/types';
import type { FirestoreFinanceSettings, FirestoreInsightsSettings, FirestoreSettings, FirestoreTaskTypesSettings } from '@/src/shared/firestore/types';

export { SETTINGS_GROUPS, SECTION_IDS, isSettingsSection, sectionInfo, type SettingsSection } from './sections';

export function useLogic() {
  const account = useAccountSettings();
  const calendar = useCalendarSettings();
  const theme = useContext(ThemeContext);
  const { prefs, uid } = usePreferences();
  const notifications = useNotifications();
  const { data: accounts } = useAccounts();
  const firebaseUser = getFirebaseAuth().currentUser;

  const appRef = useMemo(() => (uid ? settingsRef(uid) : null), [uid]);
  const { data: appSettings } = useFirestoreDoc<FirestoreSettings>(appRef);
  const insightsRef = useMemo(() => (uid ? insightsSettingsRef(uid) : null), [uid]);
  const { data: insights } = useFirestoreDoc<FirestoreInsightsSettings>(insightsRef);
  const financeRef = useMemo(() => (uid ? financeSettingsRef(uid) : null), [uid]);
  const { data: finance } = useFirestoreDoc<FirestoreFinanceSettings>(financeRef);
  const planDraftRef = useMemo(() => (uid ? doc(getFirebaseFirestore(), 'users', uid, 'settings', 'planDraft') : null), [uid]);
  const { data: planDraft } = useFirestoreDoc<{ cushion?: number | null }>(planDraftRef);
  const typesRef = useMemo(() => (uid ? taskTypesRef(uid) : null), [uid]);
  const { data: taskTypesDoc } = useFirestoreDoc<FirestoreTaskTypesSettings>(typesRef);

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window === 'undefined' ? 'unsupported' : notificationPermission()
  );

  /** Runs a change, then "Saved" (or what went wrong). */
  async function save(action: () => Promise<unknown>) {
    if (!uid) return;
    try {
      await action();
      showToast('Saved');
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not save that.');
    }
  }
  const setPref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => save(() => savePreferences(uid!, { [key]: value } as Partial<Preferences>));

  const timeZones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    } catch {
      return [Intl.DateTimeFormat().resolvedOptions().timeZone];
    }
  }, []);

  const liveAccounts = accounts.filter((a) => !a.archived);
  const taskTypes = [...TASK_TYPES, ...(taskTypesDoc?.names ?? []).filter((n) => !TASK_TYPES.includes(n))];

  return {
    uid,
    // My profile
    profile: {
      name: firebaseUser?.displayName ?? '',
      email: firebaseUser?.email ?? '',
      photoURL: firebaseUser?.photoURL ?? null,
      methods: (firebaseUser?.providerData ?? []).map((p) => (p.providerId === 'password' ? 'Email and password' : p.providerId === 'google.com' ? 'Google' : p.providerId)),
      hasPassword: (firebaseUser?.providerData ?? []).some((p) => p.providerId === 'password'),
    },
    setName: (name: string) => save(async () => firebaseUser && updateProfile(firebaseUser, { displayName: name.trim() })),
    sendPasswordReset: () =>
      save(async () => {
        if (!firebaseUser?.email) throw new Error('This account has no email address.');
        await sendPasswordResetEmail(getFirebaseAuth(), firebaseUser.email);
        showToast(`A reset link went to ${firebaseUser.email}.`);
      }),
    signOut: account.handleSignOut,
    // Preferences
    prefs,
    setPref,
    appearance: (theme?.appearance ?? 'light') as Appearance,
    setAppearance: (next: Appearance) => {
      theme?.setAppearance(next);
      showToast('Saved');
    },
    timeZone: appSettings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    timeZones,
    setTimeZone: (tz: string) => save(() => updateDoc(settingsRef(uid!), { timezone: tz })),
    currency: account.currency,
    currencies: account.filteredCurrencies,
    setCurrency: (code: string) => save(() => updateDoc(settingsRef(uid!), { displayCurrency: code })),
    // Notifications
    notificationPrefs: notifications.prefs,
    permission,
    allowPush: async () => setPermission(await requestNotificationPermission()),
    setTypeOn: (type: NotificationType, on: boolean) => save(() => setTypeMuted(uid!, type, !on)),
    setTypeChannel: (type: NotificationType, channel: 'push' | 'email', on: boolean) => save(() => setTypeChannel(uid!, type, channel, on)),
    setSummaryTime: (time: string) => save(() => saveNotificationPrefs(uid!, { summaryTime: time })),
    // Connections
    calendar,
    // Accounts and wallets
    accounts: liveAccounts,
    isSavings: isSavingsAccount,
    setDefaultAccount: (id: string | null) => setPref('defaultAccountId', id),
    setUsableForPlan: (id: string, on: boolean) => save(() => updateDoc(accountRef(uid!, id), { usableForPlan: on })),
    // Budget and forecast
    cushion: planDraft?.cushion ?? null,
    setCushion: (amount: number | null) => save(() => setDoc(planDraftRef!, { cushion: amount }, { merge: true })),
    savingsTarget: finance?.savingsTarget ?? null,
    setSavingsTarget: (fraction: number | null) => save(() => setDoc(financeSettingsRef(uid!), fraction === null ? { savingsTarget: deleteField() } : { savingsTarget: fraction }, { merge: true })),
    // Work hours and tasks
    workStart: insights?.workStart ?? '08:00',
    workEnd: insights?.workEnd ?? '17:00',
    capacityHours: insights?.capacityHours ?? 6,
    setWork: (patch: Partial<FirestoreInsightsSettings>) => save(() => setDoc(insightsSettingsRef(uid!), patch, { merge: true })),
    taskTypes,
  };
}

export type SettingsLogic = ReturnType<typeof useLogic>;
