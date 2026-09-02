import type { Metadata } from 'next';
import { CreateDebtScreen } from '@/src/screens/CreateDebt/CreateDebtScreen';

export const metadata: Metadata = {
  title: 'New debt · Dreda',
};

export default function CreateDebtPage() {
  return <CreateDebtScreen />;
}
