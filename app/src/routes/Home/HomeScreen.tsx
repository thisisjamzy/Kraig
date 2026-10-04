'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { HomeScreen as PhoneHomeScreen } from '@/src/phone/screens/Home/HomeScreen';

const WebHomeScreen = dynamic(() => import('@/src/screens/Home/HomeScreen').then((m) => m.HomeScreen), { ssr: false });

export function HomeScreen() {
  return <DeviceSplit phone={<PhoneHomeScreen />} web={<WebHomeScreen />} />;
}
