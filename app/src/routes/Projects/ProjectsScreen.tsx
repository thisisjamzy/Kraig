'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ProjectsScreen as PhoneProjectsScreen } from '@/src/phone/screens/Projects/ProjectsScreen';

const WebProjectsScreen = dynamic(() => import('@/src/screens/Projects/ProjectsScreen').then((m) => m.ProjectsScreen), { ssr: false });

export function ProjectsScreen() {
  return <DeviceSplit phone={<PhoneProjectsScreen />} web={<WebProjectsScreen />} />;
}
