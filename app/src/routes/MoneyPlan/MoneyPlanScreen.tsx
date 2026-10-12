'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { MoneyPlanScreen as PhoneMoneyPlanScreen } from '@/src/phone/screens/MoneyPlan/MoneyPlanScreen';

const WebMoneyPlanScreen = dynamic(() => import('@/src/screens/MoneyPlan/MoneyPlanScreen').then((m) => m.MoneyPlanScreen), { ssr: false });

export function MoneyPlanScreen() {
  return <DeviceSplit phone={<PhoneMoneyPlanScreen />} web={<WebMoneyPlanScreen />} />;
}
