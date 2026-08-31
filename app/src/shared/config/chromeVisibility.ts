// Single source of truth for which routes show the fixed app chrome
// (AppHeader at the top, BottomNav at the bottom) — used by both of those
// widgets and by the scroll container so it only reserves space for chrome
// that's actually showing on the current route.

const HEADER_ROUTES = ['/home', '/statistics', '/budget'];

const NO_BOTTOM_NAV_PREFIXES = [
  '/add-transaction',
  '/transactions',
  '/wallets',
  '/settings',
  '/payments',
];

export function hasAppHeader(pathname: string | null): boolean {
  return HEADER_ROUTES.includes(pathname ?? '');
}

export function hasBottomNav(pathname: string | null): boolean {
  if (!pathname) return false;
  return !NO_BOTTOM_NAV_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
