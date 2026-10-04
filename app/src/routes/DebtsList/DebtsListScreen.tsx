'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { DebtsListScreen as PhoneDebtsListScreen } from '@/src/phone/screens/DebtsList/DebtsListScreen';

const WebDebtsListScreen = dynamic(() => import('@/src/screens/DebtsList/DebtsListScreen').then((m) => m.DebtsListScreen), { ssr: false });

export function DebtsListScreen() {
  return <DeviceSplit phone={<PhoneDebtsListScreen />} web={<WebDebtsListScreen />} />;
}
