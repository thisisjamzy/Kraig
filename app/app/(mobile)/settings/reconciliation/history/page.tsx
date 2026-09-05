import type { Metadata } from 'next';
import { ReconciliationHistoryScreen } from '@/src/screens/ReconciliationHistory/ReconciliationHistoryScreen';

export const metadata: Metadata = {
  title: 'Reconciliation history · Dreda',
};

export default function ReconciliationHistoryPage() {
  return <ReconciliationHistoryScreen />;
}
