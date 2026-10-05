'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { WalletDetailScreen as PhoneWalletDetailScreen } from '@/src/phone/screens/WalletDetail/WalletDetailScreen';

const WebWalletDetailScreen = dynamic(() => import('@/src/screens/WalletDetail/WalletDetailScreen').then((m) => m.WalletDetailScreen), { ssr: false });

export function WalletDetailScreen({ walletId }: { walletId: string }) {
  return <DeviceSplit phone={<PhoneWalletDetailScreen walletId={walletId} />} web={<WebWalletDetailScreen walletId={walletId} />} />;
}
