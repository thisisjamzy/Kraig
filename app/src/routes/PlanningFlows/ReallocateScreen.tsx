'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ReallocateScreen as PhoneReallocateScreen } from '@/src/phone/screens/PlanningFlows/ReallocateScreen';

const WebReallocateScreen = dynamic(() => import('@/src/screens/PlanningFlows/ReallocateScreen').then((m) => m.ReallocateScreen), { ssr: false });

export function ReallocateScreen() {
  return <DeviceSplit phone={<PhoneReallocateScreen />} web={<WebReallocateScreen />} />;
}
