'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { WorkScreen as PhoneWorkScreen } from '@/src/phone/screens/Work/WorkScreen';

const WebWorkScreen = dynamic(() => import('@/src/screens/Work/WorkScreen').then((m) => m.WorkScreen), { ssr: false });

export function WorkScreen() {
  return <DeviceSplit phone={<PhoneWorkScreen />} web={<WebWorkScreen />} />;
}
