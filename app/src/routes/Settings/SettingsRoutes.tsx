'use client';

// Settings, two UI lines (docs/UI-LINES.md): on a phone the BASELINE list
// (/settings) and a full-screen page per section (/settings/<section>); from
// 768px up both addresses open the Settings dialog over the start page.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { SettingsScreen as PhoneSettings } from '@/src/phone/screens/Settings/SettingsScreen';
import { SettingsSectionScreen } from '@/src/phone/screens/SettingsSection/SettingsSectionScreen';
import { usePreferences } from '@/src/shared/firestore/preferences';
import { settingsHref } from '@/src/shared/navigation/settingsLink';
import type { SettingsSection } from '@/src/logic/settingsCenter/sections';

/** Wide screens: Settings is a dialog over the start page, open at `section`. */
export function OpenSettingsDialog({ section }: { section: SettingsSection }) {
  const router = useRouter();
  const { prefs, loading } = usePreferences();
  useEffect(() => {
    if (loading) return;
    router.replace(settingsHref(prefs.startPageWeb, '', section));
  }, [loading, prefs.startPageWeb, router, section]);
  return null;
}

export function SettingsRoute() {
  return <DeviceSplit phone={<PhoneSettings />} web={<OpenSettingsDialog section="preferences" />} />;
}

export function SettingsSectionRoute({ section }: { section: SettingsSection }) {
  return <DeviceSplit phone={<SettingsSectionScreen section={section} />} web={<OpenSettingsDialog section={section} />} />;
}
