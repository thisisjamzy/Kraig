// The page tree for the sidebar (medium screens and up) and the phone's
// "More" sheet — Notion style: a module's pages under its section label,
// with Buckets and Projects expandable into their own sub-pages. Budget,
// Payments and Transactions are pages of their own (no "Planning" parent).

import type { FormKind } from '@/src/shared/navigation/formPeek';
import {
  ArrowLeftRight,
  AtSign,
  BadgeCheck,
  CalendarDays,
  FileText,
  Folder,
  HandCoins,
  House,
  Layers,
  LayoutGrid,
  ShoppingBasket,
  Link2,
  PieChart,
  Sun,
  Wallet,
  WalletCards,
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
  /** "+" on hover creates a child here (in a side peek when it names a form). */
  create?: { label: string; href: string; peek?: FormKind };
  /** Other paths that light this page up. */
  also?: string[];
  /** The heading it sits under (Time: Plan, Organise, Review). */
  group?: string;
  /** A red count beside the label: Tasks shows the overdue count. */
  badge?: 'overdue';
}

export const PAGE_TREE: Record<AppMode, TreePage[]> = {
  // Money (Dreda.figcraft `Sidebar / Web`): Tracking, then Budgeting.
  money: [
    { id: 'home', href: '/home', label: 'Dashboard', icon: House, group: 'Tracking' },
    { id: 'transactions', href: '/transactions', label: 'Transactions', icon: ArrowLeftRight, also: ['/edit-transaction', '/edit-transfer'], group: 'Tracking' },
    { id: 'wallets', href: '/wallets', label: 'Wallets', icon: WalletCards, group: 'Tracking' },
    { id: 'insights', href: '/statistics', label: 'Insights', icon: PieChart, group: 'Tracking' },
    { id: 'debt', href: '/debts', label: 'Debt', icon: HandCoins, group: 'Tracking' },
    { id: 'budget', href: '/budget', label: 'Budget', icon: Wallet, also: ['/budget/item', '/budget/review', '/budget/migration', '/budget/item-kinds', '/budget/cover', '/budget/reallocate'], group: 'Budgeting' },
    {
      id: 'buckets',
      href: '/baskets',
      label: 'Baskets',
      icon: ShoppingBasket,
      children: 'buckets',
      create: { label: 'New basket', href: '/baskets/new', peek: 'basket' },
      also: ['/budget/basket', '/add-basket-item', '/edit-basket-item'],
      group: 'Budgeting',
    },
    // Priorities lives on Payments (its one view, Calendar, shows both); the
    // forecast page is off until it is redesigned to be actionable.
    { id: 'payments', href: '/payments', label: 'Payments', icon: CalendarDays, also: ['/baskets/items'], group: 'Budgeting' },
  ],
  // Time (Dreda v1.0 `Nav/Drawer Time`, BUILD-KIT v1.0 section 5.1): Plan,
  // Organise, Review. The drawer never lists individual projects. Work
  // (/work) is no longer a destination; its route still opens. Planning
  // settings is reached from Settings.
  time: [
    { id: 'time-home', href: '/projects/insights', label: 'Home', icon: House, group: 'Plan' },
    { id: 'today', href: '/projects', label: 'Today', icon: Sun, also: ['/projects/focus'], group: 'Plan' },
    { id: 'calendar', href: '/projects/calendar', label: 'Calendar', icon: CalendarDays, also: ['/projects/plan'], group: 'Plan' },
    { id: 'scheduling', href: '/projects/calendar/links', label: 'Scheduling', icon: Link2, group: 'Plan' },
    { id: 'tasks', href: '/tasks', label: 'Tasks', icon: BadgeCheck, badge: 'overdue', group: 'Plan' },
    { id: 'areas', href: '/areas', label: 'Areas', icon: LayoutGrid, group: 'Organise', create: { label: 'New area', href: '/areas/new' } },
    { id: 'folders', href: '/sections', label: 'Folders', icon: Folder, group: 'Organise', create: { label: 'New folder', href: '/sections/new' } },
    { id: 'projects', href: '/projects/all', label: 'Projects', icon: Layers, also: ['/work'], group: 'Organise', create: { label: 'New project', href: '/projects/new' } },
    { id: 'people', href: '/people', label: 'People', icon: AtSign, group: 'Organise', create: { label: 'Add someone', href: '/people/new' } },
    { id: 'library', href: '/library', label: 'Library', icon: FileText, also: ['/resources'], group: 'Organise' },
    { id: 'insights', href: '/projects/analytics', label: 'Insights', icon: PieChart, group: 'Review' },
  ],
};

export const MODE_LABEL: Record<AppMode, string> = { money: 'Money', time: 'Time' };
// Time's home is its Home page (the dashboard), since Today left the phone bar (18 Nov 2026).
export const MODE_HOME: Record<AppMode, string> = { time: '/projects/insights', money: '/home' };

/** The mode a path belongs to, or null when it's shared (settings, notifications). */
export function modeOfPath(pathname: string | null): AppMode | null {
  if (!pathname) return null;
  if (/^\/(projects|tasks|areas|sections|resources|work|people|library)(\/|$)/.test(pathname) || pathname === '/settings/planning') return 'time';
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

/** A project's own page (or a new one): under /projects but not one of Time's pages. */
const PROJECT_PAGE = /^\/projects\/(?!all$|focus|calendar|insights|analytics|plan)[^/]+/;

/** The tree page a path belongs to (the longest matching href wins). */
export function pageForPath(pathname: string | null): TreePage | null {
  if (!pathname) return null;
  // A project (and a new one) lights up Projects, not Today's /projects.
  if (PROJECT_PAGE.test(pathname)) return PAGE_TREE.time.find((p) => p.id === 'projects') ?? null;
  let best: TreePage | null = null;
  let score = -1;
  for (const page of [...PAGE_TREE.money, ...PAGE_TREE.time]) {
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
export function defaultCrumbs(pathname: string | null): { label: string; href?: string }[] {
  const mode = modeOfPath(pathname);
  const page = pageForPath(pathname);
  if (pathname === '/home') return [{ label: 'Money', href: '/home' }, { label: 'Home' }];
  if (pathname?.startsWith('/settings')) return [{ label: 'Settings' }];
  if (pathname?.startsWith('/notifications')) return [{ label: 'Notifications' }];
  const crumbs: { label: string; href?: string }[] = [];
  if (mode) crumbs.push({ label: MODE_LABEL[mode], href: MODE_HOME[mode] });
  if (page) crumbs.push({ label: page.label, href: pathOf(page.href) === pathname ? undefined : page.href });
  return crumbs.length ? crumbs : [{ label: 'Dreda' }];
}

/** The page's title when it doesn't draw its own. */
export function fallbackTitle(pathname: string | null): string {
  if (pathname === '/home') return 'Home';
  return pageForPath(pathname)?.label ?? (pathname?.startsWith('/settings') ? 'Settings' : 'Dreda');
}

/**
 * The main page of the feature a path is in: /budget/item → /budget,
 * /baskets/x → /baskets, /wallets/x → /wallets, /settings/x → /settings.
 * Null when it's in none (Home, a form such as /add-transaction).
 */
export function featurePageOf(pathname: string): string | null {
  const shared = /^\/(settings|notifications)(\/|$)/.exec(pathname);
  if (shared) return `/${shared[1]}`;
  // A project (and a new one) belongs to Projects, not Today's /projects.
  if (PROJECT_PAGE.test(pathname)) return '/projects/all';
  const page = pageForPath(pathname);
  // The Dashboard row in the sidebar is Money's home, not a feature.
  return page && page.id !== 'home' ? pathOf(page.href) : null;
}

/**
 * Where a back button goes: always a feature's main page.
 *   - On a page inside a feature: that feature's main page.
 *   - On a feature's main page: the mode's home (/home, /projects).
 *   - Elsewhere (a form, Home): the main page of the feature it was opened
 *     from (`from`, the previous page), else `from` itself.
 * Null: nowhere better, the caller uses its fallback.
 */
export function backTargetFor(url: string, from: string | null): string | null {
  const path = pathOf(url);
  const feature = featurePageOf(path);
  if (feature && feature !== path) return feature;
  if (feature) {
    // Settings and Notifications belong to no module: back goes to the
    // home of the module you came from (Time, from Planning or a Time page).
    const mode = modeOfPath(path) ?? (from ? modeOfPath(pathOf(from)) : null) ?? 'money';
    const home = MODE_HOME[mode];
    return home === path ? null : home;
  }
  if (!from) return null;
  return featurePageOf(pathOf(from)) ?? from;
}
