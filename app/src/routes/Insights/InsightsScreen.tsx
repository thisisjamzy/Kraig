'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { InsightsScreen as PhoneInsightsScreen } from '@/src/phone/screens/Insights/InsightsScreen';

const WebInsightsScreen = dynamic(() => import('@/src/screens/Insights/InsightsScreen').then((m) => m.InsightsScreen), { ssr: false });

export function InsightsScreen() {
  return <DeviceSplit phone={<PhoneInsightsScreen />} web={<WebInsightsScreen />} />;
}
