'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ProjectAnalyticsScreen as PhoneProjectAnalyticsScreen } from '@/src/phone/screens/ProjectAnalytics/ProjectAnalyticsScreen';

const WebProjectAnalyticsScreen = dynamic(() => import('@/src/screens/ProjectAnalytics/ProjectAnalyticsScreen').then((m) => m.ProjectAnalyticsScreen), { ssr: false });

export function ProjectAnalyticsScreen() {
  return <DeviceSplit phone={<PhoneProjectAnalyticsScreen />} web={<WebProjectAnalyticsScreen />} />;
}
