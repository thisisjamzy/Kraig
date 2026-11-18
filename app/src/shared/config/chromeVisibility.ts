import { modeOfPath } from '@/src/shared/config/pageTree';

// Single source of truth for which routes show the fixed app chrome
// (AppHeader at the top, a bottom nav) and which bottom nav — used by
// AppHeader, layout.tsx (to pick BottomNav vs ProjectsBottomNav), and the
// scroll container so it only reserves space for chrome that's actually
// showing on the current route.
//
// Whitelist, not blacklist: only a mode's own root/hub routes ever show
// that mode's persistent chrome. Every drill-down (a detail screen, a
// create/edit flow) shows none of it, back-arrow header instead, the same
// convention /wallets/[wallet] and /baskets/[id] already established.

// /debts is still reached via Home's own Quick Actions and behaves like any
// other drill-down (its own back-arrow header, no bottom nav). /baskets used
// to be the same, but it's now a small self-contained mode of its own —
// its own bottom nav (BucketsBottomNav), and its pages draw their own
// headers rather than the generic AppHeader — so it's tracked here for
// hasBottomNav's sake but deliberately left out of hasAppHeader below.
// /baskets/[id] and /baskets/new are still plain drill-downs (their own
// back-arrow header) — only Buckets, Buckets analytics (the phone line's
// Insights tab; the web line sends it to /statistics) and Priorities count
// as the hub.
// Baskets and Payments joined Money's bar (owner, 18 Nov 2026): Baskets no
// longer has a bar of its own.
const MONEY_HUB_ROUTES = ['/home', '/statistics', '/budget', '/payments', '/baskets', '/baskets/items'];
const PROJECTS_HUB_ROUTES = ['/projects', '/projects/calendar', '/projects/focus', '/projects/insights', '/projects/analytics'];
// /payments joined when Priorities moved onto it (its one Calendar view).
const BUCKETS_HUB_ROUTES: string[] = [];

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
// Time v1.0's Today draws its own header too (phone/widgets/TimeHeader).
const OWN_HEADER_ROUTES = ['/home', '/projects', '/projects/calendar', '/projects/focus', '/projects/insights', '/payments', '/baskets', '/baskets/items'];

export function hasAppHeader(pathname: string | null): boolean {
  if (pathname && OWN_HEADER_ROUTES.includes(pathname)) return false;
  const mode = navMode(pathname);
  return mode === 'money' || mode === 'projects';
}

export function hasBottomNav(pathname: string | null): boolean {
  return navMode(pathname) !== 'none' || timeTab(pathname) !== null;
}

// Time's tab bar (Dreda v1.0 `Phone tab bar`, BUILD-KIT v1.0 section 5.2):
// on every Time page but its forms. Home, Scheduling, Calendar and Tasks have tabs;
// every other Time page was opened from Profile, so Profile stays lit.
export type TimeTab = 'home' | 'today' | 'scheduling' | 'calendar' | 'tasks' | 'profile';

const TIME_FORM = /\/(new|edit)(\/|$)/;

export function timeTab(pathname: string | null): TimeTab | null {
  // Planning settings is a Time page reached from Profile.
  if (pathname === '/settings/planning') return 'profile';
  if (!pathname || modeOfPath(pathname) !== 'time' || TIME_FORM.test(pathname)) return null;
  if (pathname === '/projects/insights') return 'home';
  if (pathname.startsWith('/projects/calendar/links')) return 'scheduling';
  if (pathname === '/projects' || pathname.startsWith('/projects/focus')) return 'today';
  if (pathname === '/projects/plan' || pathname === '/projects/calendar' || pathname.startsWith('/projects/calendar/events')) return 'calendar';
  if (pathname === '/tasks' || pathname.startsWith('/tasks/')) return 'tasks';
  return 'profile';
}
