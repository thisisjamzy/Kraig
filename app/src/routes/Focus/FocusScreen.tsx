'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { FocusScreen as PhoneFocusScreen } from '@/src/phone/screens/Focus/FocusScreen';

const WebFocusScreen = dynamic(() => import('@/src/screens/Focus/FocusScreen').then((m) => m.FocusScreen), { ssr: false });

export function FocusScreen() {
  return <DeviceSplit phone={<PhoneFocusScreen />} web={<WebFocusScreen />} />;
}
