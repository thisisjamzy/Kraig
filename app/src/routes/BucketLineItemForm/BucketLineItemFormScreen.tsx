'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { BucketLineItemFormScreen as PhoneBucketLineItemFormScreen } from '@/src/phone/screens/BucketLineItemForm/BucketLineItemFormScreen';

const WebBucketLineItemFormScreen = dynamic(() => import('@/src/screens/BucketLineItemForm/BucketLineItemFormScreen').then((m) => m.BucketLineItemFormScreen), { ssr: false });

export function BucketLineItemFormScreen(props: ComponentProps<typeof PhoneBucketLineItemFormScreen>) {
  return <DeviceSplit phone={<PhoneBucketLineItemFormScreen {...props} />} web={<WebBucketLineItemFormScreen {...props} />} />;
}
