'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TransactionHistoryScreen as PhoneTransactionHistoryScreen } from '@/src/phone/screens/TransactionHistory/TransactionHistoryScreen';

const WebTransactionHistoryScreen = dynamic(() => import('@/src/screens/TransactionHistory/TransactionHistoryScreen').then((m) => m.TransactionHistoryScreen), { ssr: false });

export function TransactionHistoryScreen() {
  return <DeviceSplit phone={<PhoneTransactionHistoryScreen />} web={<WebTransactionHistoryScreen />} />;
}
