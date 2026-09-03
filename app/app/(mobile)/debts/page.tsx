import type { Metadata } from 'next';
import { DebtsListScreen } from '@/src/screens/DebtsList/DebtsListScreen';

export const metadata: Metadata = {
  title: 'Debt · Dreda',
};

export default function DebtsPage() {
  return <DebtsListScreen />;
}
