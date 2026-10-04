'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PlanningItemScreen as PhonePlanningItemScreen } from '@/src/phone/screens/PlanningItem/PlanningItemScreen';

const WebPlanningItemScreen = dynamic(() => import('@/src/screens/PlanningItem/PlanningItemScreen').then((m) => m.PlanningItemScreen), { ssr: false });

export function PlanningItemScreen(props: ComponentProps<typeof PhonePlanningItemScreen>) {
  return <DeviceSplit phone={<PhonePlanningItemScreen {...props} />} web={<WebPlanningItemScreen {...props} />} />;
}
