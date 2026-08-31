import type { Metadata } from 'next';
import { PinScreen } from '@/src/screens/Pin/PinScreenClient';

export const metadata: Metadata = {
  title: 'Enter PIN · Dreda',
};

export default function PinPage() {
  return <PinScreen />;
}
