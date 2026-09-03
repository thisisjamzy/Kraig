import type { Metadata } from 'next';
import { NotificationsScreen } from '@/src/screens/Notifications/NotificationsScreen';

export const metadata: Metadata = {
  title: 'Notifications · Dreda',
};

export default function NotificationsPage() {
  return <NotificationsScreen />;
}
