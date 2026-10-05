'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { WalletsScreen as PhoneWalletsScreen } from '@/src/phone/screens/Wallets/WalletsScreen';

const WebWalletsScreen = dynamic(() => import('@/src/screens/Wallets/WalletsScreen').then((m) => m.WalletsScreen), { ssr: false });

export function WalletsScreen() {
  return <DeviceSplit phone={<PhoneWalletsScreen />} web={<WebWalletsScreen />} />;
}
