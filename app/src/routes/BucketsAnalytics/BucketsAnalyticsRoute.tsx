'use client';

// Baskets analytics is gone from both lines (docs/UI-LINES.md): phones go
// to Baskets, whose card and grouped list show the month per money type;
// wide screens go to Money Insights (/statistics), which covers it. The
// route stays so old links and bookmarks still land somewhere.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';

function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => router.replace(href), [router, href]);
  return null;
}

export function BucketsAnalyticsRoute() {
  return <DeviceSplit phone={<RedirectTo href="/baskets" />} web={<RedirectTo href="/statistics" />} />;
}
