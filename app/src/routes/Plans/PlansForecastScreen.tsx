'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PlanScreen } from '@/src/phone/screens/Plan/PlanScreen';

const WebPlansForecastScreen = dynamic(() => import('@/src/screens/Plans/PlansForecastScreen').then((m) => m.PlansForecastScreen), { ssr: false });

export function PlansForecastScreen() {
  return <DeviceSplit phone={<PlanScreen />} web={<WebPlansForecastScreen />} />;
}
