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
// Now derived from useLayout() (device classes at 768 / 1024 / 1440, see
// src/styles/tokens/breakpoints.ts's deviceBreakpoints). It used to switch
// at 640px, which put 640–767px windows on the web shell; those now get
// the phone app, like every other compact width.

import { useLayout } from './useLayout';

export type ViewportMode = 'mobile' | 'tablet' | 'desktop';

export function useViewportMode(): ViewportMode {
  const { deviceClass } = useLayout();
  if (deviceClass === 'compact') return 'mobile';
  return deviceClass === 'medium' ? 'tablet' : 'desktop';
}

// Convenience for the common case — most call sites only care whether the
// web shell/layout should be showing at all, not which of its tiers.
export function useIsWeb(): boolean {
  return useLayout().isWide;
}
