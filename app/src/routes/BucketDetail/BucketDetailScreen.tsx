'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { BucketDetailScreen as PhoneBucketDetailScreen } from '@/src/phone/screens/BucketDetail/BucketDetailScreen';

const WebBucketDetailScreen = dynamic(() => import('@/src/screens/BucketDetail/BucketDetailScreen').then((m) => m.BucketDetailScreen), { ssr: false });

export function BucketDetailScreen(props: ComponentProps<typeof PhoneBucketDetailScreen>) {
  return <DeviceSplit phone={<PhoneBucketDetailScreen {...props} />} web={<WebBucketDetailScreen {...props} />} />;
}
