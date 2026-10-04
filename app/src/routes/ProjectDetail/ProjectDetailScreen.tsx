'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ProjectDetailScreen as PhoneProjectDetailScreen } from '@/src/phone/screens/ProjectDetail/ProjectDetailScreen';

const WebProjectDetailScreen = dynamic(() => import('@/src/screens/ProjectDetail/ProjectDetailScreen').then((m) => m.ProjectDetailScreen), { ssr: false });

export function ProjectDetailScreen(props: ComponentProps<typeof PhoneProjectDetailScreen>) {
  return <DeviceSplit phone={<PhoneProjectDetailScreen {...props} />} web={<WebProjectDetailScreen {...props} />} />;
}
