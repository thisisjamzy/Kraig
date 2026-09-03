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

const MONEY_HUB_ROUTES = ['/home', '/statistics', '/budget', '/goals', '/debts'];
const PROJECTS_HUB_ROUTES = ['/projects', '/projects/calendar', '/projects/focus', '/projects/analytics'];

export type NavMode = 'money' | 'projects' | 'none';

export function navMode(pathname: string | null): NavMode {
  if (!pathname) return 'none';
  if (MONEY_HUB_ROUTES.includes(pathname)) return 'money';
  if (PROJECTS_HUB_ROUTES.includes(pathname)) return 'projects';
  return 'none';
}

export function hasAppHeader(pathname: string | null): boolean {
  return navMode(pathname) !== 'none';
}

export function hasBottomNav(pathname: string | null): boolean {
  return navMode(pathname) !== 'none';
}
