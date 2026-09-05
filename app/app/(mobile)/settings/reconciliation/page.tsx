import type { Metadata } from 'next';
import { ReconciliationScreen } from '@/src/screens/Reconciliation/ReconciliationScreen';

export const metadata: Metadata = {
  title: 'Reconciliation · Dreda',
};

export default function ReconciliationPage() {
  return <ReconciliationScreen />;
}
