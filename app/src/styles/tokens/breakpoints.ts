// Approved breakpoints. Keep every responsive rule in the app aligned to these.

export const breakpoints = {
  mobile: 0,
  tablet: 640,
  laptop: 1024,
  desktop: 1280,
  largeDesktop: 1536,
} as const;

export type BreakpointTokens = typeof breakpoints;
