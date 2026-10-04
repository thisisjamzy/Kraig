'use client';

import type { ReactNode } from 'react';
import { useLayout } from '@/src/shared/hooks/useLayout';

// The one switch between the two UI lines (docs/UI-LINES.md):
//   phone line  (src/phone)          viewport under 768 CSS px
//   web line    (src/screens, ...)   768 px and wider
// The server and the first paint are always the phone line (useLayout's
// server snapshot), so a phone never renders, or waits on, the web line.
// Crossing 768 px (a resize, rotating a tablet) swaps lines live.
export function DeviceSplit({ phone, web }: { phone: ReactNode; web: ReactNode }) {
  const { isWide } = useLayout();
  return <>{isWide ? web : phone}</>;
}
