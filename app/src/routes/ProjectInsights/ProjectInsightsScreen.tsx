'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ProjectInsightsScreen as PhoneProjectInsightsScreen } from '@/src/phone/screens/ProjectInsights/ProjectInsightsScreen';

const WebProjectInsightsScreen = dynamic(() => import('@/src/screens/ProjectInsights/ProjectInsightsScreen').then((m) => m.ProjectInsightsScreen), { ssr: false });

export function ProjectInsightsScreen(props: ComponentProps<typeof PhoneProjectInsightsScreen>) {
  return <DeviceSplit phone={<PhoneProjectInsightsScreen {...props} />} web={<WebProjectInsightsScreen {...props} />} />;
}
