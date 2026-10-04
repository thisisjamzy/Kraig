'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { AllAreasScreen as PhoneAllAreasScreen } from '@/src/phone/screens/AllAreas/AllAreasScreen';

const WebAllAreasScreen = dynamic(() => import('@/src/screens/AllAreas/AllAreasScreen').then((m) => m.AllAreasScreen), { ssr: false });

export function AllAreasScreen() {
  return <DeviceSplit phone={<PhoneAllAreasScreen />} web={<WebAllAreasScreen />} />;
}
