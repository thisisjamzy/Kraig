'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PlanningScreen as PhonePlanningScreen } from '@/src/phone/screens/Planning/PlanningScreen';

const WebPlanningScreen = dynamic(() => import('@/src/screens/Planning/PlanningScreen').then((m) => m.PlanningScreen), { ssr: false });

export function PlanningScreen(props: ComponentProps<typeof PhonePlanningScreen>) {
  return <DeviceSplit phone={<PhonePlanningScreen {...props} />} web={<WebPlanningScreen {...props} />} />;
}
