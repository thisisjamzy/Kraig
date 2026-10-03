import type { Metadata } from 'next';
import { ReadyToPayScreen } from '@/src/screens/ReadyToPay/ReadyToPayScreen';

export const metadata: Metadata = {
  title: 'Ready to pay · Dreda',
};

export default function ReadyToPayPage() {
  return <ReadyToPayScreen />;
}
