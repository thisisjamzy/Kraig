// Approved breakpoints. Keep every responsive rule in the app aligned to these.

export const breakpoints = {
  mobile: 0,
  tablet: 640,
  laptop: 1024,
  desktop: 1280,
  largeDesktop: 1536,
} as const;

export type BreakpointTokens = typeof breakpoints;

// Device classes for the responsive layout layer (app shell, page
// templates — docs/ARCHITECTURE-RESPONSIVE.md). Compact is the phone app,
// unchanged; everything else is added on top at these widths. CSS can't
// read these from JS, so every `@media (min-width: …)` in a *.wide.module.css
// file uses the same three numbers: 768, 1024, 1440.
export const deviceBreakpoints = {
  medium: 768, // iPad portrait, small tablets, split-screen windows
  expanded: 1024, // iPad landscape, laptops
  large: 1440, // desktops and big monitors
} as const;

export type DeviceClass = 'compact' | 'medium' | 'expanded' | 'large';
