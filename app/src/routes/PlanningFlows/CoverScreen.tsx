'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { CoverScreen as PhoneCoverScreen } from '@/src/phone/screens/PlanningFlows/CoverScreen';

const WebCoverScreen = dynamic(() => import('@/src/screens/PlanningFlows/CoverScreen').then((m) => m.CoverScreen), { ssr: false });

export function CoverScreen() {
  return <DeviceSplit phone={<PhoneCoverScreen />} web={<WebCoverScreen />} />;
}
