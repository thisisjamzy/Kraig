'use client';

// Two UI lines for this screen (docs/UI-LINES.md): on a phone, Resources is
// the "Coming soon" screen; from 768px up, the web Resources page.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ComingSoonScreen } from '@/src/phone/screens/ComingSoon/ComingSoonScreen';

const WebResourcesScreen = dynamic(() => import('@/src/screens/Resources/ResourcesScreen').then((m) => m.ResourcesScreen), { ssr: false });

export function ResourcesScreen() {
  return (
    <DeviceSplit
      phone={<ComingSoonScreen title="Resources" message="Resources is coming soon." icon="book-open" />}
      web={<WebResourcesScreen />}
    />
  );
}
