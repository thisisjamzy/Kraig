import type { Metadata } from 'next';
import { SettingsScreen } from '@/src/screens/Settings/SettingsScreen';

export const metadata: Metadata = {
  title: 'Settings · Dreda',
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
