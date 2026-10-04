'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ReadyToPayScreen as PhoneReadyToPayScreen } from '@/src/phone/screens/ReadyToPay/ReadyToPayScreen';

const WebReadyToPayScreen = dynamic(() => import('@/src/screens/ReadyToPay/ReadyToPayScreen').then((m) => m.ReadyToPayScreen), { ssr: false });

export function ReadyToPayScreen() {
  return <DeviceSplit phone={<PhoneReadyToPayScreen />} web={<WebReadyToPayScreen />} />;
}
