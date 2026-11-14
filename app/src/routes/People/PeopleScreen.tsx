'use client';

// Two UI lines for these screens (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PeopleScreen as PhonePeopleScreen } from '@/src/phone/screens/People/PeopleScreen';
import { PersonScreen as PhonePersonScreen } from '@/src/phone/screens/People/PersonScreen';
import { PersonNewScreen as PhonePersonNewScreen } from '@/src/phone/screens/People/PersonNewScreen';

const WebPeopleScreen = dynamic(() => import('@/src/screens/People/PeopleScreen').then((m) => m.PeopleScreen), { ssr: false });
const WebPersonScreen = dynamic(() => import('@/src/screens/People/PersonScreen').then((m) => m.PersonScreen), { ssr: false });

export function PeopleScreen() {
  return <DeviceSplit phone={<PhonePeopleScreen />} web={<WebPeopleScreen />} />;
}

export function PersonScreen({ personId }: { personId: string }) {
  return <DeviceSplit phone={<PhonePersonScreen personId={personId} />} web={<WebPersonScreen personId={personId} />} />;
}

// Wide screens add people in a dialog on the People page.
export function PersonNewScreen() {
  return <DeviceSplit phone={<PhonePersonNewScreen />} web={<WebPeopleScreen />} />;
}
