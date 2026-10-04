import type { Metadata } from 'next';
import { DebtsListScreen } from '@/src/routes/DebtsList/DebtsListScreen';

export const metadata: Metadata = {
  title: 'Debt · Dreda',
};

export default function DebtsPage() {
  return <DebtsListScreen />;
}
