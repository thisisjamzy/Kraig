'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PrioritiesScreen as PhonePrioritiesScreen } from '@/src/phone/screens/Plans/PrioritiesScreen';

const WebPrioritiesScreen = dynamic(() => import('@/src/screens/Plans/PrioritiesScreen').then((m) => m.PrioritiesScreen), { ssr: false });

export function PrioritiesScreen() {
  return <DeviceSplit phone={<PhonePrioritiesScreen />} web={<WebPrioritiesScreen />} />;
}
