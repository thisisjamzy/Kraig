'use client';

// The device class and input type, for the few places the component
// structure itself changes with screen size (drawer instead of bottom
// nav, a side panel instead of a page). Everything else adapts in CSS
// (min-width media queries and container queries).
//
//   compact   < 768     phones — the app exactly as it always was
//   medium    768–1023  iPad portrait, small tablets, split view
//   expanded  1024–1439 iPad landscape, laptops
//   large     ≥ 1440    desktops
//
// The server snapshot (and so the first client paint) is always compact:
// SSR output is the phone app on every device, and a phone's media
// queries never match the wider classes, so nothing rendered only for
// medium and up can ever reach a phone.

import { useSyncExternalStore } from 'react';
import { deviceBreakpoints, type DeviceClass } from '@/src/styles/tokens/breakpoints';

export interface Layout {
  deviceClass: DeviceClass;
  /** Not compact — the drawer, top bar and page templates are in use. */
  isWide: boolean;
  /** A mouse or trackpad (pointer: fine) — hover states and shortcuts. */
  finePointer: boolean;
  /** hover: hover — false on iPad even with a large screen. */
  canHover: boolean;
}

const QUERIES = {
  medium: `(min-width: ${deviceBreakpoints.medium}px)`,
  expanded: `(min-width: ${deviceBreakpoints.expanded}px)`,
  large: `(min-width: ${deviceBreakpoints.large}px)`,
  fine: '(pointer: fine)',
  hover: '(hover: hover)',
};

const SERVER: Layout = { deviceClass: 'compact', isWide: false, finePointer: false, canHover: false };
let cached: Layout = SERVER;

function read(): Layout {
  const m = (q: string) => window.matchMedia(q).matches;
  const deviceClass: DeviceClass = m(QUERIES.large)
    ? 'large'
    : m(QUERIES.expanded)
      ? 'expanded'
      : m(QUERIES.medium)
        ? 'medium'
        : 'compact';
  const next: Layout = { deviceClass, isWide: deviceClass !== 'compact', finePointer: m(QUERIES.fine), canHover: m(QUERIES.hover) };
  // Same object while nothing changed — useSyncExternalStore needs that.
  if (
    next.deviceClass === cached.deviceClass &&
    next.finePointer === cached.finePointer &&
    next.canHover === cached.canHover
  ) {
    return cached;
  }
  cached = next;
  return cached;
}

function subscribe(onChange: () => void) {
  const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
  };
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}
