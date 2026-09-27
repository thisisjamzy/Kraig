'use client';

// Settings > Insights: daily capacity, working hours, notification switches
// and every alert threshold (src/viewmodels/insights/settings.ts). Edited as
// a draft and saved together to settings/insights.

import { useState } from 'react';
import { setDoc } from 'firebase/firestore';
import { insightsSettingsRef } from '@/src/shared/firestore/refs';
import { useInsightsSources } from '@/src/shared/insights/useInsightsData';
import { DEFAULT_THRESHOLDS, INSIGHTS_DEFAULTS, type InsightsSettings } from '@/src/viewmodels/insights/settings';
import { requestNotificationPermission, notificationPermission } from '@/src/shared/insights/notify';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic() {
  const sources = useInsightsSources();
  const [draft, setDraft] = useState<InsightsSettings | null>(null);
  const value = draft ?? sources.settings;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(notificationPermission);

  function update(patch: Partial<InsightsSettings>) {
    setSaved(false);
    setDraft({ ...value, ...patch });
  }
  function setThreshold(key: keyof InsightsSettings['thresholds'], next: number) {
    update({ thresholds: { ...value.thresholds, [key]: next } });
  }
  function resetDefaults() {
    setSaved(false);
    setDraft({ ...INSIGHTS_DEFAULTS, thresholds: { ...DEFAULT_THRESHOLDS } });
  }

  const workError = value.workEnd <= value.workStart ? 'Working hours must end after they start.' : null;

  async function save() {
    if (!sources.uid || saving || workError) return;
    setSaving(true);
    try {
      await setDoc(insightsSettingsRef(sources.uid), {
        capacityHours: value.capacityHours,
        workStart: value.workStart,
        workEnd: value.workEnd,
        thresholds: { ...value.thresholds } as Record<string, number>,
        notifyMorning: value.notifyMorning,
        notifyProjectRed: value.notifyProjectRed,
        notifyEvening: value.notifyEvening,
      });
      setDraft(null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function enableNotifications() {
    setPermission(await requestNotificationPermission());
  }

  const navigateBack = useGoBack();
  return {
    value,
    dirty: draft !== null,
    update,
    setThreshold,
    resetDefaults,
    save,
    saving,
    saved,
    workError,
    permission,
    enableNotifications,
    goBack: () => navigateBack('/projects/insights'),
    loading: sources.loading,
  };
}
