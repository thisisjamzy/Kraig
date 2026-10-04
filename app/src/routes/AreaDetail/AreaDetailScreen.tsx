'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { AreaDetailScreen as PhoneAreaDetailScreen } from '@/src/phone/screens/AreaDetail/AreaDetailScreen';

const WebAreaDetailScreen = dynamic(() => import('@/src/screens/AreaDetail/AreaDetailScreen').then((m) => m.AreaDetailScreen), { ssr: false });

export function AreaDetailScreen(props: ComponentProps<typeof PhoneAreaDetailScreen>) {
  return <DeviceSplit phone={<PhoneAreaDetailScreen {...props} />} web={<WebAreaDetailScreen {...props} />} />;
}
