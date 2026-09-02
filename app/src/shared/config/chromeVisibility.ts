// Single source of truth for which routes show the fixed app chrome
// (AppHeader at the top, BottomNav at the bottom) — used by both of those
// widgets and by the scroll container so it only reserves space for chrome
// that's actually showing on the current route.

const HEADER_ROUTES = ['/home', '/statistics', '/budget', '/goals'];

// A trailing slash on '/goals/' (not '/debts', which stays a bare prefix)
// is deliberate: the Goals & Debt hub at the bare /goals path is now a 4th
// bottom-nav tab (see BottomNav.tsx), same tier as /home /statistics
// /budget — but everything nested under it (goal detail, debt detail,
// create flows, debt's own repay/edit/plan pages) stays a drill-down with
// just a back arrow, same as every other detail screen in this app.
const NO_BOTTOM_NAV_PREFIXES = [
  '/add-transaction',
  '/edit-transaction',
  '/add-budget-category',
  '/create-category',
  '/categories',
  '/goals/',
  '/debts',
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
