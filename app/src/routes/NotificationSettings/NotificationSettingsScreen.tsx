'use client';

// Settings > Notifications at its own address (bell and notification
// links point here): on a phone the section's full-screen page, from 768px
// up the Settings dialog at Notifications.

import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { OpenSettingsDialog } from '@/src/routes/Settings/SettingsRoutes';
import { SettingsSectionScreen } from '@/src/phone/screens/SettingsSection/SettingsSectionScreen';

export function NotificationSettingsScreen() {
  return <DeviceSplit phone={<SettingsSectionScreen section="notifications" />} web={<OpenSettingsDialog section="notifications" />} />;
}
