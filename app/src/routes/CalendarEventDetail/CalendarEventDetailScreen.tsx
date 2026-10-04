'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { CalendarEventDetailScreen as PhoneCalendarEventDetailScreen } from '@/src/phone/screens/CalendarEventDetail/CalendarEventDetailScreen';

const WebCalendarEventDetailScreen = dynamic(() => import('@/src/screens/CalendarEventDetail/CalendarEventDetailScreen').then((m) => m.CalendarEventDetailScreen), { ssr: false });

export function CalendarEventDetailScreen(props: ComponentProps<typeof PhoneCalendarEventDetailScreen>) {
  return <DeviceSplit phone={<PhoneCalendarEventDetailScreen {...props} />} web={<WebCalendarEventDetailScreen {...props} />} />;
}
