import type { Metadata } from 'next';
import { WalletAuditScreen } from '@/src/screens/WalletAudit/WalletAuditScreen';

export const metadata: Metadata = {
  title: 'Wallet audit · Dreda',
};

export default async function WalletAuditPage({ params }: PageProps<'/wallets/[wallet]/audit'>) {
  const { wallet } = await params;
  return <WalletAuditScreen walletId={decodeURIComponent(wallet)} />;
}
