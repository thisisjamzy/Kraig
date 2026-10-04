'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PlanningBucketScreen as PhonePlanningBucketScreen } from '@/src/phone/screens/PlanningBucket/PlanningBucketScreen';

const WebPlanningBucketScreen = dynamic(() => import('@/src/screens/PlanningBucket/PlanningBucketScreen').then((m) => m.PlanningBucketScreen), { ssr: false });

export function PlanningBucketScreen(props: ComponentProps<typeof PhonePlanningBucketScreen>) {
  return <DeviceSplit phone={<PhonePlanningBucketScreen {...props} />} web={<WebPlanningBucketScreen {...props} />} />;
}
