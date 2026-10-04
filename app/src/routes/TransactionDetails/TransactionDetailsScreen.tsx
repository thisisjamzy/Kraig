'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TransactionDetailsScreen as PhoneTransactionDetailsScreen } from '@/src/phone/screens/TransactionDetails/TransactionDetailsScreen';

const WebTransactionDetailsScreen = dynamic(() => import('@/src/screens/TransactionDetails/TransactionDetailsScreen').then((m) => m.TransactionDetailsScreen), { ssr: false });

export function TransactionDetailsScreen(props: ComponentProps<typeof PhoneTransactionDetailsScreen>) {
  return <DeviceSplit phone={<PhoneTransactionDetailsScreen {...props} />} web={<WebTransactionDetailsScreen {...props} />} />;
}
