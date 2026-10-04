'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ProjectsCalendarScreen as PhoneProjectsCalendarScreen } from '@/src/phone/screens/ProjectsCalendar/ProjectsCalendarScreen';

const WebProjectsCalendarScreen = dynamic(() => import('@/src/screens/ProjectsCalendar/ProjectsCalendarScreen').then((m) => m.ProjectsCalendarScreen), { ssr: false });

export function ProjectsCalendarScreen() {
  return <DeviceSplit phone={<PhoneProjectsCalendarScreen />} web={<WebProjectsCalendarScreen />} />;
}
