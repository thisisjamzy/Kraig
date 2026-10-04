'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { MonthReviewScreen as PhoneMonthReviewScreen } from '@/src/phone/screens/MonthReview/MonthReviewScreen';

const WebMonthReviewScreen = dynamic(() => import('@/src/screens/MonthReview/MonthReviewScreen').then((m) => m.MonthReviewScreen), { ssr: false });

export function MonthReviewScreen() {
  return <DeviceSplit phone={<PhoneMonthReviewScreen />} web={<WebMonthReviewScreen />} />;
}
