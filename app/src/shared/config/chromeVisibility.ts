// Single source of truth for which routes show the fixed app chrome
// (AppHeader at the top, a bottom nav) and which bottom nav — used by
// AppHeader, layout.tsx (to pick BottomNav vs ProjectsBottomNav), and the
// scroll container so it only reserves space for chrome that's actually
// showing on the current route.
//
// Whitelist, not blacklist: only a mode's own root/hub routes ever show
// that mode's persistent chrome. Every drill-down (a detail screen, a
// create/edit flow) shows none of it, back-arrow header instead, the same
// convention /wallets/[wallet] and /goals/[id] already established.

// /debts is still reached via Home's own Quick Actions and behaves like any
// other drill-down (its own back-arrow header, no bottom nav). /goals used
// to be the same, but it's now a small self-contained mode of its own —
// its own bottom nav (GoalsBottomNav) and its own shared header
// (src/widgets/GoalsHeader), not the generic AppHeader every other hub
// uses (Goals' header carries a Month/All-time toggle AppHeader has no
// concept of) — so it's tracked here for hasBottomNav's sake but
// deliberately left out of hasAppHeader below. /goals/[id] and /goals/new
// are still plain drill-downs (their own back-arrow header), same as
// before — only the three tab destinations count as the Goals hub.
const MONEY_HUB_ROUTES = ['/home', '/statistics', '/budget'];
const PROJECTS_HUB_ROUTES = ['/projects', '/projects/calendar', '/projects/focus', '/projects/analytics'];
const GOALS_HUB_ROUTES = ['/goals', '/goals/analytics', '/goals/items'];

export type NavMode = 'money' | 'projects' | 'goals' | 'none';

export function navMode(pathname: string | null): NavMode {
  if (!pathname) return 'none';
  if (MONEY_HUB_ROUTES.includes(pathname)) return 'money';
  if (PROJECTS_HUB_ROUTES.includes(pathname)) return 'projects';
  if (GOALS_HUB_ROUTES.includes(pathname)) return 'goals';
  return 'none';
}

// Goals is a hub for bottom-nav/scroll-clearance purposes, but not for the
// generic AppHeader — it renders its own header instead (see GoalsHeader).
export function hasAppHeader(pathname: string | null): boolean {
  const mode = navMode(pathname);
  return mode === 'money' || mode === 'projects';
}

export function hasBottomNav(pathname: string | null): boolean {
  return navMode(pathname) !== 'none';
}
