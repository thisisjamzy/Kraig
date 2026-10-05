'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.
// On a phone, Transactions is the transaction history list; filtered to a
// basket or category (old Budget > History links redirect here), it's the
// Budget screen's History tab, which shows those filters.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TransactionHistoryScreen } from '@/src/phone/screens/TransactionHistory/TransactionHistoryScreen';
import { PlanningScreen } from '@/src/phone/screens/Planning/PlanningScreen';

const WebTransactionsScreen = dynamic(() => import('@/src/screens/Transactions/TransactionsScreen').then((m) => m.TransactionsScreen), { ssr: false });

export function TransactionsScreen({ filtered = false }: { filtered?: boolean }) {
  return <DeviceSplit phone={filtered ? <PlanningScreen defaultTab="history" /> : <TransactionHistoryScreen />} web={<WebTransactionsScreen />} />;
}
