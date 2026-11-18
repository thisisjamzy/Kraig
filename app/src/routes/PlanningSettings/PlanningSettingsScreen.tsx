'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.
// Planning is a full page on web too, not the Settings dialog.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PlanningSettingsScreen as PhonePlanningSettingsScreen } from '@/src/phone/screens/PlanningSettings/PlanningSettingsScreen';

const WebPlanningSettingsScreen = dynamic(() => import('@/src/screens/PlanningSettings/PlanningSettingsScreen').then((m) => m.PlanningSettingsScreen), { ssr: false });

export function PlanningSettingsScreen() {
  return <DeviceSplit phone={<PhonePlanningSettingsScreen />} web={<WebPlanningSettingsScreen />} />;
}
