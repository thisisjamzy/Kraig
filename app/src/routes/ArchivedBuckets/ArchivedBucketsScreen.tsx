'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ArchivedBucketsScreen as PhoneArchivedBucketsScreen } from '@/src/phone/screens/ArchivedBuckets/ArchivedBucketsScreen';

const WebArchivedBucketsScreen = dynamic(() => import('@/src/screens/ArchivedBuckets/ArchivedBucketsScreen').then((m) => m.ArchivedBucketsScreen), { ssr: false });

export function ArchivedBucketsScreen() {
  return <DeviceSplit phone={<PhoneArchivedBucketsScreen />} web={<WebArchivedBucketsScreen />} />;
}
