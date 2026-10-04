// Single source of truth for which routes show the fixed app chrome
// (AppHeader at the top, a bottom nav) and which bottom nav — used by
// AppHeader, layout.tsx (to pick BottomNav vs ProjectsBottomNav), and the
// scroll container so it only reserves space for chrome that's actually
// showing on the current route.
//
// Whitelist, not blacklist: only a mode's own root/hub routes ever show
// that mode's persistent chrome. Every drill-down (a detail screen, a
// create/edit flow) shows none of it, back-arrow header instead, the same
// convention /wallets/[wallet] and /buckets/[id] already established.

// /debts is still reached via Home's own Quick Actions and behaves like any
// other drill-down (its own back-arrow header, no bottom nav). /buckets used
// to be the same, but it's now a small self-contained mode of its own —
// its own bottom nav (BucketsBottomNav), and its pages draw their own
// headers rather than the generic AppHeader — so it's tracked here for
// hasBottomNav's sake but deliberately left out of hasAppHeader below.
// /buckets/[id] and /buckets/new are still plain drill-downs (their own
// back-arrow header) — only Buckets and Priorities count as the hub (its
// Insights tab is Money Insights, /statistics).
const MONEY_HUB_ROUTES = ['/home', '/statistics', '/budget'];
const PROJECTS_HUB_ROUTES = ['/projects', '/projects/calendar', '/projects/focus', '/projects/insights', '/projects/analytics'];
const BUCKETS_HUB_ROUTES = ['/buckets', '/buckets/items'];

export type NavMode = 'money' | 'projects' | 'buckets' | 'none';

export function navMode(pathname: string | null): NavMode {
  if (!pathname) return 'none';
  if (MONEY_HUB_ROUTES.includes(pathname)) return 'money';
  if (PROJECTS_HUB_ROUTES.includes(pathname)) return 'projects';
  if (BUCKETS_HUB_ROUTES.includes(pathname)) return 'buckets';
  return 'none';
}

// Buckets is a hub for bottom-nav/scroll-clearance purposes, but not for the
// generic AppHeader — its pages draw their own headers.
// The Projects calendar and Focus page are hubs too, but draw their own
// headers (src/screens/ProjectsCalendar, src/screens/Focus), so the
// generic AppHeader stays off there to avoid two stacked headers.
const OWN_HEADER_ROUTES = ['/projects/calendar', '/projects/focus', '/projects/insights'];

export function hasAppHeader(pathname: string | null): boolean {
  if (pathname && OWN_HEADER_ROUTES.includes(pathname)) return false;
  const mode = navMode(pathname);
  return mode === 'money' || mode === 'projects';
}

export function hasBottomNav(pathname: string | null): boolean {
  return navMode(pathname) !== 'none';
}
