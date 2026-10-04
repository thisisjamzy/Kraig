'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { NotificationsScreen as PhoneNotificationsScreen } from '@/src/phone/screens/Notifications/NotificationsScreen';

const WebNotificationsScreen = dynamic(() => import('@/src/screens/Notifications/NotificationsScreen').then((m) => m.NotificationsScreen), { ssr: false });

export function NotificationsScreen() {
  return <DeviceSplit phone={<PhoneNotificationsScreen />} web={<WebNotificationsScreen />} />;
}
