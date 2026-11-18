'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { PublicBookingScreen as PhonePublicBookingScreen } from '@/src/phone/screens/PublicBooking/PublicBookingScreen';

const WebPublicBookingScreen = dynamic(() => import('@/src/screens/PublicBooking/PublicBookingScreen').then((m) => m.PublicBookingScreen), { ssr: false });

export function PublicBookingScreen({ slug }: { slug: string }) {
  return <DeviceSplit phone={<PhonePublicBookingScreen slug={slug} />} web={<WebPublicBookingScreen slug={slug} />} />;
}
