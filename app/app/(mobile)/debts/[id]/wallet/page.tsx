import type { Metadata } from 'next';
import { WalletEffectFormScreen } from '@/src/screens/DebtForms/WalletEffectFormScreen';

export const metadata: Metadata = {
  title: 'Change wallet effect · Dreda',
};

export default async function DebtWalletEffectPage({ params, searchParams }: PageProps<'/debts/[id]/wallet'>) {
  const { id } = await params;
  const { to } = await searchParams;
  return <WalletEffectFormScreen debtId={decodeURIComponent(id)} prefillTo={typeof to === 'string' ? to : null} />;
}
