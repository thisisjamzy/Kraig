'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.
// On a phone, Payments is the Budget screen's Payments tab.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PlanningScreen } from '@/src/phone/screens/Planning/PlanningScreen';

const WebPaymentsScreen = dynamic(() => import('@/src/screens/Payments/PaymentsScreen').then((m) => m.PaymentsScreen), { ssr: false });

export function PaymentsScreen() {
  return <DeviceSplit phone={<PlanningScreen defaultTab="payments" />} web={<WebPaymentsScreen />} />;
}
