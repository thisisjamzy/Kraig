'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { AllProjectsScreen as PhoneAllProjectsScreen } from '@/src/phone/screens/AllProjects/AllProjectsScreen';

const WebAllProjectsScreen = dynamic(() => import('@/src/screens/AllProjects/AllProjectsScreen').then((m) => m.AllProjectsScreen), { ssr: false });

export function AllProjectsScreen() {
  return <DeviceSplit phone={<PhoneAllProjectsScreen />} web={<WebAllProjectsScreen />} />;
}
