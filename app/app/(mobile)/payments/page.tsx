import type { Metadata } from 'next';
import { PaymentsScreen } from '@/src/screens/Payments/PaymentsScreen';

export const metadata: Metadata = {
  title: 'Payments · Dreda',
};

export default function PaymentsPage() {
  return <PaymentsScreen />;
}
