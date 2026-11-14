'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { SchedulingLinksScreen as PhoneSchedulingLinksScreen } from '@/src/phone/screens/SchedulingLinks/SchedulingLinksScreen';

const WebSchedulingLinksScreen = dynamic(() => import('@/src/screens/SchedulingLinks/SchedulingLinksScreen').then((m) => m.SchedulingLinksScreen), { ssr: false });

export function SchedulingLinksScreen() {
  return <DeviceSplit phone={<PhoneSchedulingLinksScreen />} web={<WebSchedulingLinksScreen />} />;
}
