'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { FoldersScreen as PhoneFoldersScreen } from '@/src/phone/screens/Folders/FoldersScreen';

const WebFoldersScreen = dynamic(() => import('@/src/screens/Folders/FoldersScreen').then((m) => m.FoldersScreen), { ssr: false });

export function FoldersScreen() {
  return <DeviceSplit phone={<PhoneFoldersScreen />} web={<WebFoldersScreen />} />;
}
