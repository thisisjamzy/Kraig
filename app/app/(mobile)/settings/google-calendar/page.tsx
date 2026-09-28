import type { Metadata } from 'next';
import { GoogleCalendarSettingsScreen } from '@/src/screens/GoogleCalendarSettings/GoogleCalendarSettingsScreen';

export const metadata: Metadata = {
  title: 'Google Calendar · Dreda',
};

export default function GoogleCalendarSettingsPage() {
  return <GoogleCalendarSettingsScreen />;
}
