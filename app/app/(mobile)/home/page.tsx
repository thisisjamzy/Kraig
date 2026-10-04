import type { Metadata } from 'next';
import { HomeScreen } from '@/src/routes/Home/HomeScreen';

export const metadata: Metadata = {
  title: 'Home · Dreda',
};

export default function HomePage() {
  return <HomeScreen />;
}
