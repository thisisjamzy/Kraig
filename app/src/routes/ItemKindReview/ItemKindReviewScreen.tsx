'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ItemKindReviewScreen as PhoneItemKindReviewScreen } from '@/src/phone/screens/ItemKindReview/ItemKindReviewScreen';

const WebItemKindReviewScreen = dynamic(() => import('@/src/screens/ItemKindReview/ItemKindReviewScreen').then((m) => m.ItemKindReviewScreen), { ssr: false });

export function ItemKindReviewScreen() {
  return <DeviceSplit phone={<PhoneItemKindReviewScreen />} web={<WebItemKindReviewScreen />} />;
}
