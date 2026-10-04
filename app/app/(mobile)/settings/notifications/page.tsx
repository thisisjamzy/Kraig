import type { Metadata } from 'next';
import { NotificationSettingsScreen } from '@/src/screens/NotificationSettings/NotificationSettingsScreen';

export const metadata: Metadata = {
  title: 'Notification settings · Dreda',
};

export default function NotificationSettingsPage() {
  return <NotificationSettingsScreen />;
}
