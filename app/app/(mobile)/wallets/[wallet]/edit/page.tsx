import type { Metadata } from 'next';
import { WalletEditScreen } from '@/src/screens/WalletEdit/WalletEditScreen';

export const metadata: Metadata = {
  title: 'Edit wallet · Dreda',
};

export default async function WalletEditPage({ params }: PageProps<'/wallets/[wallet]/edit'>) {
  const { wallet } = await params;
  return <WalletEditScreen walletId={decodeURIComponent(wallet)} />;
}
