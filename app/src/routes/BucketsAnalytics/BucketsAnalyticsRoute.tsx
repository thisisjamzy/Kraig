'use client';

// Two UI lines (docs/UI-LINES.md): phones keep Buckets analytics (the
// Insights tab of their Buckets bottom nav); the web line has no such page,
// its Money Insights (/statistics) covers it, so wide screens go there.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { BucketsAnalyticsScreen } from '@/src/phone/screens/BucketsAnalytics/BucketsAnalyticsScreen';

function ToMoneyInsights() {
  const router = useRouter();
  useEffect(() => router.replace('/statistics'), [router]);
  return null;
}

export function BucketsAnalyticsRoute() {
  return <DeviceSplit phone={<BucketsAnalyticsScreen />} web={<ToMoneyInsights />} />;
}
