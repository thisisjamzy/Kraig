// Navigation for medium screens and up (the side drawer, src/widgets/
// AppShell). Phones keep their own bottom navs — BottomNav,
// ProjectsBottomNav, BucketsBottomNav — untouched.

import {
  CalendarDays,
  ChartNoAxesCombined,
  FolderKanban,
  History,
  Home,
  LayoutGrid,
  ListOrdered,
  PieChart,
  SlidersHorizontal,
  Sun,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type AppMode = 'time' | 'money';

export interface WideNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Nested under the item above (Planning's pages). */
  child?: boolean;
  /** Other paths that light this item up (its drill-downs). */
  also?: string[];
  /** Planning's pages are tabs of /budget (?tab=). */
  tab?: 'budget' | 'payments' | 'history';
}

export const WIDE_NAV: Record<AppMode, WideNavItem[]> = {
  time: [
    { href: '/projects', label: 'Today', icon: Sun, also: ['/tasks'] },
    { href: '/projects/focus', label: 'Focus', icon: Target },
    { href: '/projects/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/projects/all', label: 'Projects', icon: FolderKanban, also: ['/areas', '/sections'] },
    { href: '/projects/insights', label: 'Insights', icon: ChartNoAxesCombined, also: ['/projects/analytics'] },
  ],
  money: [
    { href: '/home', label: 'Home', icon: Home, also: ['/wallets'] },
    { href: '/buckets', label: 'Buckets', icon: LayoutGrid },
    { href: '/buckets/items', label: 'Priorities', icon: ListOrdered },
    { href: '/budget', label: 'Planning', icon: SlidersHorizontal },
    { href: '/budget', label: 'Budget', icon: Wallet, child: true, tab: 'budget' },
    { href: '/budget?tab=payments', label: 'Payments', icon: CalendarDays, child: true, tab: 'payments', also: ['/payments'] },
    { href: '/budget?tab=history', label: 'History', icon: History, child: true, tab: 'history', also: ['/transactions', '/edit-transaction', '/edit-transfer'] },
    { href: '/statistics', label: 'Insights', icon: PieChart, also: ['/buckets/analytics'] },
    { href: '/buckets/forecast', label: 'Plans forecast', icon: TrendingUp },
  ],
};

export const MODE_HOME: Record<AppMode, string> = { time: '/projects', money: '/home' };

/** The mode a path belongs to, or null when it's shared (settings,
 * notifications) — the drawer then keeps whichever mode was last shown. */
export function modeOfPath(pathname: string | null): AppMode | null {
  if (!pathname) return null;
  if (/^\/(projects|tasks|areas|sections|resources|address-book)(\/|$)/.test(pathname)) return 'time';
  if (/^\/(home|buckets|budget|payments|transactions|statistics|wallets|debts|categories|add-transaction|edit-transaction|edit-transfer|add-bucket-item|edit-bucket-item|create-category|transaction-templates)(\/|$)/.test(pathname)) {
    return 'money';
  }
  return null;
}

/** Is this item the current page? Planning's parent never lights up on
 * its own — its child items do. */
export function isNavItemActive(item: WideNavItem, items: WideNavItem[], pathname: string | null, search = ''): boolean {
  if (!pathname) return false;
  // On /budget, the ?tab= decides between Planning's pages.
  if (pathname === '/budget') {
    const tab = new URLSearchParams(search).get('tab') ?? 'budget';
    return item.tab === tab;
  }
  const matches = (href: string) => {
    const path = href.split('?')[0];
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  // The longest matching href in the list wins, so /buckets/items lights
  // Priorities, not Buckets.
  const score = (i: WideNavItem) =>
    Math.max(-1, ...[i.href, ...(i.also ?? [])].filter(matches).map((h) => h.length));
  const best = Math.max(...items.map(score));
  if (best < 0) return false;
  const winner = items.filter((i) => score(i) === best);
  // Planning's parent and its Budget child share /budget — the child wins.
  const preferred = winner.find((i) => i.child) ?? winner[0];
  return preferred === item;
}

// Page titles for the top bar, longest prefix first.
const TITLES: [string, string][] = [
  ['/projects/calendar', 'Calendar'],
  ['/projects/focus', 'Focus'],
  ['/projects/insights', 'Insights'],
  ['/projects/analytics', 'Analytics'],
  ['/projects/all', 'Projects'],
  ['/projects/new', 'New project'],
  ['/projects/', 'Project'],
  ['/projects', 'Today'],
  ['/tasks/new', 'New task'],
  ['/tasks', 'Tasks'],
  ['/areas', 'Areas'],
  ['/home', 'Home'],
  ['/buckets/items', 'Priorities'],
  ['/buckets/forecast', 'Plans forecast'],
  ['/buckets/analytics', 'Insights'],
  ['/buckets', 'Buckets'],
  ['/budget', 'Budget'],
  ['/payments', 'Payments'],
  ['/transactions', 'History'],
  ['/statistics', 'Insights'],
  ['/wallets', 'Wallets'],
  ['/debts', 'Debts'],
  ['/add-transaction', 'Add transaction'],
  ['/notifications', 'Notifications'],
  ['/settings', 'Settings'],
];

export function pageTitle(pathname: string | null): string {
  if (!pathname) return 'Dreda';
  for (const [prefix, title] of TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) return title;
  }
  return 'Dreda';
}

