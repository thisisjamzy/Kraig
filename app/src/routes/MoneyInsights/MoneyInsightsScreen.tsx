'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { MoneyInsightsScreen as PhoneMoneyInsightsScreen } from '@/src/phone/screens/MoneyInsights/MoneyInsightsScreen';

const WebMoneyInsightsScreen = dynamic(() => import('@/src/screens/MoneyInsights/MoneyInsightsScreen').then((m) => m.MoneyInsightsScreen), { ssr: false });

export function MoneyInsightsScreen() {
  return <DeviceSplit phone={<PhoneMoneyInsightsScreen />} web={<WebMoneyInsightsScreen />} />;
}
