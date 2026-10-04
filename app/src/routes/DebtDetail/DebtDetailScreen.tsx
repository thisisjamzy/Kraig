'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { DebtDetailScreen as PhoneDebtDetailScreen } from '@/src/phone/screens/DebtDetail/DebtDetailScreen';

const WebDebtDetailScreen = dynamic(() => import('@/src/screens/DebtDetail/DebtDetailScreen').then((m) => m.DebtDetailScreen), { ssr: false });

export function DebtDetailScreen(props: ComponentProps<typeof PhoneDebtDetailScreen>) {
  return <DeviceSplit phone={<PhoneDebtDetailScreen {...props} />} web={<WebDebtDetailScreen {...props} />} />;
}
