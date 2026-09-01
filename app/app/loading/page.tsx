import type { Metadata } from 'next';
import { LoadingScreen } from '@/src/screens/Loading/LoadingScreen';

export const metadata: Metadata = {
  title: 'Loading · Dreda',
};

export default function LoadingPage() {
  return <LoadingScreen />;
}
