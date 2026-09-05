import type { Metadata } from 'next';
import { ReconcileBalancesScreen } from '@/src/screens/ReconcileBalances/ReconcileBalancesScreen';

export const metadata: Metadata = {
  title: 'Audit & reconcile balances · Dreda',
};

export default function ReconcileBalancesPage() {
  return <ReconcileBalancesScreen />;
}
