import type { Metadata } from 'next';
import { WalletsScreen } from '@/src/screens/Wallets/WalletsScreen';

export const metadata: Metadata = {
  title: 'Wallets · Dreda',
};

export default function WalletsPage() {
  return <WalletsScreen />;
}
