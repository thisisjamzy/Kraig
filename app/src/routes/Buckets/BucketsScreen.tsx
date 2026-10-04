'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { BucketsScreen as PhoneBucketsScreen } from '@/src/phone/screens/Buckets/BucketsScreen';

const WebBucketsScreen = dynamic(() => import('@/src/screens/Buckets/BucketsScreen').then((m) => m.BucketsScreen), { ssr: false });

export function BucketsScreen() {
  return <DeviceSplit phone={<PhoneBucketsScreen />} web={<WebBucketsScreen />} />;
}
