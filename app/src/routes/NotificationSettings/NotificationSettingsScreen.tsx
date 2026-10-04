'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { NotificationSettingsScreen as PhoneNotificationSettingsScreen } from '@/src/phone/screens/NotificationSettings/NotificationSettingsScreen';

const WebNotificationSettingsScreen = dynamic(
  () => import('@/src/screens/NotificationSettings/NotificationSettingsScreen').then((m) => m.NotificationSettingsScreen),
  { ssr: false }
);

export function NotificationSettingsScreen() {
  return <DeviceSplit phone={<PhoneNotificationSettingsScreen />} web={<WebNotificationSettingsScreen />} />;
}
