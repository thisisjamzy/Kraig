'use client';

import dynamic from 'next/dynamic';

// `dynamic(..., { ssr: false })` must be called from a Client Component, so
// this thin wrapper exists purely to host that call — the actual PIN screen
// (randomized keypad layout) is skipped entirely during server rendering.
export const PinScreen = dynamic(() => import('./PinScreen').then((mod) => mod.PinScreen), {
  ssr: false,
});
