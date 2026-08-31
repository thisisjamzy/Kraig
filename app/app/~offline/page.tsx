import type { Metadata } from 'next';
import { OfflineScreen } from '@/src/screens/Offline/OfflineScreen';

export const metadata: Metadata = {
  title: "You're offline · Dreda",
};

export default function OfflinePage() {
  return <OfflineScreen />;
}
