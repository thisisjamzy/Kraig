'use client';

// The one place that decides mobile vs. web presentation, for the parallel
// "web shell" build (src/widgets/WebSidebar, WebTopBar, and every
// ScreenName.web.module.css sibling file). Deliberately a plain hook, not a
// Context/Provider — every hub screen calls this directly, same as any
// other hook in this directory, rather than paying for a provider that
// only ever holds one derived value.
//
// getServerSnapshot always returns 'mobile' — SSR output and the very
// first client paint are therefore byte-identical to today's mobile-only
// app on every device, before this hook's subscription has ever run. A
// phone's media queries never match tablet/laptop, so a mobile visitor
// never even mounts a web-shell component; this is what makes the parallel
// build structurally incapable of regressing the existing mobile UX.
//
// Breakpoints come from the app's own already-approved scale
// (src/styles/tokens/breakpoints.ts), not the numbers in PRD Files/webview
// — that file's own header comment says to keep every responsive rule
// aligned to it, and until now nothing actually did.

import { useSyncExternalStore } from 'react';
import { breakpoints } from '@/src/styles/tokens/breakpoints';

export type ViewportMode = 'mobile' | 'tablet' | 'desktop';

function getSnapshot(): ViewportMode {
  if (window.matchMedia(`(min-width: ${breakpoints.laptop}px)`).matches) return 'desktop';
  if (window.matchMedia(`(min-width: ${breakpoints.tablet}px)`).matches) return 'tablet';
  return 'mobile';
}

function getServerSnapshot(): ViewportMode {
  return 'mobile';
}

function subscribe(onStoreChange: () => void): () => void {
  const tabletQuery = window.matchMedia(`(min-width: ${breakpoints.tablet}px)`);
  const laptopQuery = window.matchMedia(`(min-width: ${breakpoints.laptop}px)`);
  tabletQuery.addEventListener('change', onStoreChange);
  laptopQuery.addEventListener('change', onStoreChange);
  return () => {
    tabletQuery.removeEventListener('change', onStoreChange);
    laptopQuery.removeEventListener('change', onStoreChange);
  };
}

export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Convenience for the common case — most call sites only care whether the
// web shell/layout should be showing at all, not which of its two tiers.
export function useIsWeb(): boolean {
  return useViewportMode() !== 'mobile';
}
