import type { Metadata } from 'next';
import { GoalsScreen } from '@/src/screens/Goals/GoalsScreen';

export const metadata: Metadata = {
  title: 'Goals & Debt · Dreda',
};

export default function GoalsPage() {
  return <GoalsScreen />;
}
