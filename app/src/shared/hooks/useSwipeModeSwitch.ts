'use client';

// Swipe between Money mode (Home) and Projects/Time mode (Projects hub) —
// the gesture counterpart to widgets/ModeSwitch's tap toggle. Only ever
// attached to the two hub screens themselves (not any drill-down route).
//
// The two modes are the only two stops on a loop, so ANY horizontal swipe
// past the threshold — left-to-right or right-to-left — flips to the other
// mode; there's no "wrong direction" to reject. That's what makes it feel
// circular: swipe left-to-right on Home to land on Time, then swipe
// right-to-left on Time to land back on Home, same as swiping the "wrong"
// way on either screen would.
//
// Never swipe-navigates when the gesture started inside a horizontally
// scrollable element (an ancestor with `data-hscroll`, see HomeScreen's
// wallets chart container) — that element's own scroll takes priority, the
// exact conflict a past instruction on this Home screen explicitly called
// out to avoid.

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const SWIPE_THRESHOLD_X = 60;
const SWIPE_MAX_Y = 50;

export function useSwipeModeSwitch(currentMode: 'money' | 'projects') {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let ignore = false;

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      ignore = Boolean((event.target as HTMLElement).closest('[data-hscroll]'));
    }

    function onTouchEnd(event: TouchEvent) {
      if (ignore) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaY) > SWIPE_MAX_Y) return;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_X) return;
      router.push(currentMode === 'money' ? '/projects' : '/home');
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [currentMode, router]);

  return containerRef;
}
