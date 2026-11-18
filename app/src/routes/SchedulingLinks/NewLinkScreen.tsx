'use client';

// New scheduling link. Phone: its own page with a Cancel and Create footer.
// Tablet and web: the Scheduling page, whose New link panel is always open.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { NewLinkScreen as PhoneNewLinkScreen } from '@/src/phone/screens/SchedulingLinks/NewLinkScreen';

const WebSchedulingLinksScreen = dynamic(() => import('@/src/screens/SchedulingLinks/SchedulingLinksScreen').then((m) => m.SchedulingLinksScreen), { ssr: false });

export function NewLinkScreen() {
  return <DeviceSplit phone={<PhoneNewLinkScreen />} web={<WebSchedulingLinksScreen />} />;
}
