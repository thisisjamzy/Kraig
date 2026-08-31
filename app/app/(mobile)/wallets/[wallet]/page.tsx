import type { Metadata } from 'next';
import { WalletDetailScreen } from '@/src/screens/WalletDetail/WalletDetailScreen';

export const metadata: Metadata = {
  title: 'Wallet · Dreda',
};

export default async function WalletDetailPage({ params }: PageProps<'/wallets/[wallet]'>) {
  const { wallet } = await params;
  return <WalletDetailScreen walletId={decodeURIComponent(wallet)} />;
}
