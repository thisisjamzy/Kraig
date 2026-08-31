import type { Metadata } from 'next';
import { HomeScreen } from '@/src/screens/Home/HomeScreen';

export const metadata: Metadata = {
  title: 'Home · Dreda',
};

export default function HomePage() {
  return <HomeScreen />;
}
