import type { Metadata } from 'next';
import { FocusScreen } from '@/src/screens/Focus/FocusScreen';

export const metadata: Metadata = {
  title: 'Focus · Dreda',
};

export default function FocusPage() {
  return <FocusScreen />;
}
