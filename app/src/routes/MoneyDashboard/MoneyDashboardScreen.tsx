'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { MoneyDashboardScreen as PhoneMoneyDashboardScreen } from '@/src/phone/screens/MoneyDashboard/MoneyDashboardScreen';

const WebMoneyDashboardScreen = dynamic(() => import('@/src/screens/MoneyDashboard/MoneyDashboardScreen').then((m) => m.MoneyDashboardScreen), { ssr: false });

export function MoneyDashboardScreen() {
  return <DeviceSplit phone={<PhoneMoneyDashboardScreen />} web={<WebMoneyDashboardScreen />} />;
}
