'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { LibraryScreen as PhoneLibraryScreen } from '@/src/phone/screens/Library/LibraryScreen';

const WebLibraryScreen = dynamic(() => import('@/src/screens/Library/LibraryScreen').then((m) => m.LibraryScreen), { ssr: false });

export function LibraryScreen() {
  return <DeviceSplit phone={<PhoneLibraryScreen />} web={<WebLibraryScreen />} />;
}
