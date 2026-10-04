'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.
// On a phone, Transactions is the transaction history list.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TransactionHistoryScreen } from '@/src/phone/screens/TransactionHistory/TransactionHistoryScreen';

const WebTransactionsScreen = dynamic(() => import('@/src/screens/Transactions/TransactionsScreen').then((m) => m.TransactionsScreen), { ssr: false });

export function TransactionsScreen() {
  return <DeviceSplit phone={<TransactionHistoryScreen />} web={<WebTransactionsScreen />} />;
}
