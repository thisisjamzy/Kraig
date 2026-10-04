import type { Metadata } from 'next';
import { SettingsRoute } from '@/src/routes/Settings/SettingsRoutes';

export const metadata: Metadata = {
  title: 'Settings · Dreda',
};

export default function SettingsPage() {
  return <SettingsRoute />;
}
