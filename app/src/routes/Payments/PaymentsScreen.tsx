'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.
// On a phone, Payments is its own screen (Dreda.figcraft `Payments / Phone`).

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PaymentsScreen as PhonePaymentsScreen } from '@/src/phone/screens/Payments/PaymentsScreen';

const WebPaymentsScreen = dynamic(() => import('@/src/screens/Payments/PaymentsScreen').then((m) => m.PaymentsScreen), { ssr: false });

export function PaymentsScreen() {
  return <DeviceSplit phone={<PhonePaymentsScreen />} web={<WebPaymentsScreen />} />;
}
