'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TimePlanScreen as PhoneTimePlanScreen } from '@/src/phone/screens/TimePlan/TimePlanScreen';

const WebTimePlanScreen = dynamic(() => import('@/src/screens/TimePlan/TimePlanScreen').then((m) => m.TimePlanScreen), { ssr: false });

export function TimePlanScreen() {
  return <DeviceSplit phone={<PhoneTimePlanScreen />} web={<WebTimePlanScreen />} />;
}
