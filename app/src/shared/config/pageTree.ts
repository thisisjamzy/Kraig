// The page tree for the sidebar (medium screens and up) and the phone's
// "More" sheet — Notion style: a module's pages under its section label,
// with Buckets and Projects expandable into their own sub-pages. Budget,
// Payments and Transactions are pages of their own (no "Planning" parent).

import {
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  FolderKanban,
  Goal,
  HandCoins,
  LayoutGrid,
  ListOrdered,
  Map as MapIcon,
  PieChart,
  Sun,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type AppMode = 'time' | 'money';

export interface TreePage {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Expandable into live sub-pages. */
  children?: 'buckets' | 'projects';
  /** "+" on hover creates a child here. */
  create?: { label: string; href: string };
  /** Other paths that light this page up. */
  also?: string[];
}

export const PAGE_TREE: Record<AppMode, TreePage[]> = {
  money: [
    { id: 'budget', href: '/budget', label: 'Budget', icon: Wallet, also: ['/budget/item', '/budget/review', '/budget/migration', '/budget/cover', '/budget/reallocate'] },
    {
      id: 'buckets',
      href: '/buckets',
      label: 'Buckets',
      icon: LayoutGrid,
      children: 'buckets',
      create: { label: 'New bucket', href: '/buckets/new' },
      also: ['/budget/bucket', '/add-bucket-item', '/edit-bucket-item'],
    },
    { id: 'priorities', href: '/buckets/items', label: 'Priorities', icon: ListOrdered },
    { id: 'payments', href: '/payments', label: 'Payments', icon: CalendarDays },
    { id: 'transactions', href: '/transactions', label: 'Transactions', icon: ArrowLeftRight, also: ['/edit-transaction', '/edit-transfer'] },
    { id: 'insights', href: '/statistics', label: 'Insights', icon: PieChart, also: ['/buckets/analytics'] },
    { id: 'plan', href: '/buckets/forecast', label: 'Plan and forecast', icon: TrendingUp },
    { id: 'goals', href: '/buckets?type=Savings', label: 'Goals', icon: Goal },
    { id: 'debt', href: '/debts', label: 'Debt', icon: HandCoins },
  ],
  time: [
    { id: 'today', href: '/projects', label: 'Today', icon: Sun, also: ['/tasks'] },
    { id: 'calendar', href: '/projects/calendar', label: 'Calendar', icon: CalendarCheck },
    { id: 'focus', href: '/projects/focus', label: 'Focus', icon: Target },
    {
      id: 'projects',
      href: '/projects/all',
      label: 'Projects',
      icon: FolderKanban,
      children: 'projects',
      create: { label: 'New project', href: '/projects/new' },
      also: ['/sections'],
    },
    { id: 'areas', href: '/areas', label: 'Areas', icon: MapIcon },
    { id: 'resources', href: '/resources', label: 'Resources', icon: BookOpen },
    { id: 'insights', href: '/projects/insights', label: 'Insights', icon: ChartNoAxesCombined, also: ['/projects/analytics'] },
  ],
};

export const MODE_LABEL: Record<AppMode, string> = { money: 'Money', time: 'Time' };
export const MODE_HOME: Record<AppMode, string> = { time: '/projects', money: '/home' };

/** The mode a path belongs to, or null when it's shared (settings, notifications). */
export function modeOfPath(pathname: string | null): AppMode | null {
  if (!pathname) return null;
  if (/^\/(projects|tasks|areas|sections|resources|address-book)(\/|$)/.test(pathname)) return 'time';
  if (
    /^\/(home|buckets|budget|payments|transactions|statistics|wallets|debts|categories|add-transaction|edit-transaction|edit-transfer|add-bucket-item|edit-bucket-item|create-category|transaction-templates)(\/|$)/.test(
      pathname
    )
  ) {
    return 'money';
  }
  return null;
}

const pathOf = (href: string) => href.split('?')[0];

/** The tree page a path belongs to (the longest matching href wins). */
export function pageForPath(pathname: string | null, search = ''): TreePage | null {
  if (!pathname) return null;
  let best: TreePage | null = null;
  let score = -1;
  for (const page of [...PAGE_TREE.money, ...PAGE_TREE.time]) {
    // Goals is Buckets filtered to savings.
    if (page.id === 'goals') {
      if (pathname === '/buckets' && new URLSearchParams(search).get('type') === 'Savings') return page;
      continue;
    }
    for (const href of [page.href, ...(page.also ?? [])]) {
      const path = pathOf(href);
      if ((pathname === path || pathname.startsWith(`${path}/`)) && path.length > score) {
        best = page;
        score = path.length;
      }
    }
  }
  return best;
}

/** A breadcrumb for a page that doesn't set its own: "Money / Insights". */
export function defaultCrumbs(pathname: string | null, search = ''): { label: string; href?: string }[] {
  const mode = modeOfPath(pathname);
  const page = pageForPath(pathname, search);
  if (pathname === '/home') return [{ label: 'Money', href: '/home' }, { label: 'Home' }];
  if (pathname?.startsWith('/settings')) return [{ label: 'Settings' }];
  if (pathname?.startsWith('/notifications')) return [{ label: 'Notifications' }];
  const crumbs: { label: string; href?: string }[] = [];
  if (mode) crumbs.push({ label: MODE_LABEL[mode], href: MODE_HOME[mode] });
  if (page) crumbs.push({ label: page.label, href: pathOf(page.href) === pathname ? undefined : page.href });
  return crumbs.length ? crumbs : [{ label: 'Dreda' }];
}

/** The page's title when it doesn't draw its own. */
export function fallbackTitle(pathname: string | null, search = ''): string {
  if (pathname === '/home') return 'Home';
  return pageForPath(pathname, search)?.label ?? (pathname?.startsWith('/settings') ? 'Settings' : 'Dreda');
}
