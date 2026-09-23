'use client';

// The web shell's persistent left nav rail (the "drawer") — mounted by
// app/(mobile)/layout.tsx only when useViewportMode() isn't 'mobile'
// (AppShellLayout's own header comment explains why that guarantees zero
// mobile impact). Unlike mobile's three separate mode-scoped bottom navs,
// this shows only ONE mode's own menu at a time (Money or Time/Projects),
// switched via the promo card pinned at the bottom.
//
// Both modes' menus are exactly two groups — "Main" and "System" — per an
// explicit spec, not a reuse of any mobile nav list:
//   Money   Main: Dashboard, Budgets, Goals, Debts
//           System: Control Panel (-> Settings), Analytics (-> Statistics),
//                   History (-> Transactions)
//   Time    Main: Home, Calendar, Projects (-> All Projects), Analytics
//           System: Control Panel (-> its own placeholder), Address Book,
//                   Resources
// The two modes never point the same nav item at the same URL — Time's own
// "Control Panel" deliberately lands on its own route
// (app/(mobile)/projects/control-panel), not Money's real /settings, even
// though both are still unbuilt placeholders today. "Address Book" and
// "Resources" have no real feature behind them yet either, so they land on
// ComingSoonScreen placeholders (app/(mobile)/address-book,
// app/(mobile)/resources) rather than a dead link or a route that
// silently does something unrelated.
//
// Which mode is showing is NOT purely a function of the current path —
// most of the links above (Debts, History/Transactions, both Control
// Panels, Address Book, Resources, ...) aren't real per-mode "hub" routes
// chromeVisibility.ts's navMode() recognizes, so deriving activeMode from
// navMode(pathname) alone flipped the drawer to Money the moment you
// followed any of those links from Time mode. Instead, the last mode a
// real hub route confirmed is persisted (localStorage) and used as the
// fallback for every other route — so navigating within a mode, via any
// of its own links, never changes which drawer is showing; only the
// switch card's own button (which navigates to the OTHER mode's hub
// route) does.
//
// Restyled onto Lunacy's own light dashboard palette (Lunacy/Images —
// white surface, near-black ink text) — see WebSidebar.module.css's own
// header comment for the full color rundown. Both modes' group labels
// alternate brand blue ("Main") and the palette's red accent ("System"),
// matching the reference's own two-tone "MAIN"/"SYSTEM" section labels. An
// inactive item's label is regular weight in the muted secondary color;
// only the active item picks up brand blue + bold text (and its icon's
// chip goes solid blue) — every other item stays deliberately light so the
// one active destination is unambiguous.
//
// 'tablet' (640-1023px) collapses to icon-only, showing just the
// logomark up top with a native title tooltip per item; 'desktop'
// (1024px+) shows the full lockup and full icon+label — same two-tier
// collapse the reference dashboards use. Both logo files live in
// public/logos/ — now the BLACK-text lockup/mark, since the rail's
// surface is light, not the white-on-transparent pair this component used
// before the redesign. The whole rail never scrolls — see .sidebar's own
// comment in WebSidebar.module.css.

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Clock,
  Contact,
  CreditCard,
  FolderKanban,
  History,
  Home,
  PieChart,
  Settings,
  SlidersHorizontal,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import fullLogo from '@/public/logos/black_full.png';
import logomark from '@/public/logos/black_logomark.png';
import { useViewportMode } from '@/src/shared/hooks/useViewportMode';
import { navMode } from '@/src/shared/config/chromeVisibility';
import styles from './WebSidebar.module.css';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const MONEY_MENU_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { href: '/home', label: 'Dashboard', icon: Home },
      { href: '/budget', label: 'Budgets', icon: SlidersHorizontal },
      { href: '/goals', label: 'Goals', icon: Target },
      { href: '/debts', label: 'Debts', icon: CreditCard },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Control Panel', icon: Settings },
      { href: '/statistics', label: 'Analytics', icon: PieChart },
      { href: '/transactions', label: 'History', icon: History },
    ],
  },
];

const PROJECTS_MENU_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { href: '/projects', label: 'Home', icon: Home },
      { href: '/projects/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/projects/all', label: 'Projects', icon: FolderKanban },
      { href: '/projects/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/projects/control-panel', label: 'Control Panel', icon: Settings },
      { href: '/address-book', label: 'Address Book', icon: Contact },
      { href: '/resources', label: 'Resources', icon: BookOpen },
    ],
  },
];

// Copy for the bottom promo card, keyed by the mode it SWITCHES TO (the
// mirror of the mode currently showing) — Lunacy/Images' own "Switch to
// Money" card, minus its illustration (removed per an explicit request).
const SWITCH_COPY: Record<
  'money' | 'projects',
  { tag: string; heading: string; body: string; buttonLabel: string; icon: LucideIcon; href: string }
> = {
  projects: {
    tag: 'Time',
    heading: 'Switch to Time',
    body: 'Track areas, projects and tasks over in Time mode.',
    buttonLabel: 'Move over now',
    icon: Clock,
    href: '/projects',
  },
  money: {
    tag: 'Money',
    heading: 'Switch to Money',
    body: 'Keep every wallet, budget and bill in one place.',
    buttonLabel: 'Move over now',
    icon: Wallet,
    href: '/home',
  },
};

const DRAWER_MODE_STORAGE_KEY = 'drawer-mode';

export function WebSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = useViewportMode();
  const compact = mode === 'tablet';

  // A Goals route counts as 'money' (Goals is a single link inside
  // Money's own menu, not its own mode) — everything else that isn't a
  // real per-mode hub route is ambiguous ('none'), and falls through to
  // the persisted last-known mode below rather than hard-defaulting to
  // 'money'.
  const routeMode = navMode(pathname);
  const confirmedMode = routeMode === 'projects' ? 'projects' : routeMode === 'money' || routeMode === 'goals' ? 'money' : null;

  // The persisted fallback for ambiguous routes — read once, lazily (a
  // function initializer, not an effect, so there's no extra render before
  // the real value shows up; this component only ever mounts client-side,
  // see this file's own header comment on isWeb, so window is always safe
  // here). Kept in sync with confirmedMode via React's own documented
  // "adjusting state when a prop changes" pattern — a plain state variable
  // mirroring the last-seen confirmedMode, compared and, if different,
  // updated during render itself — rather than a ref (this repo's lint
  // config forbids reading/writing a ref during render) or an effect that
  // calls setState (flagged as a cascading-render risk).
  const [storedMode, setStoredMode] = useState<'money' | 'projects'>(() => {
    const stored = window.localStorage.getItem(DRAWER_MODE_STORAGE_KEY);
    return stored === 'money' || stored === 'projects' ? stored : 'money';
  });
  const [prevConfirmedMode, setPrevConfirmedMode] = useState(confirmedMode);
  if (confirmedMode !== prevConfirmedMode) {
    setPrevConfirmedMode(confirmedMode);
    if (confirmedMode) {
      window.localStorage.setItem(DRAWER_MODE_STORAGE_KEY, confirmedMode);
      setStoredMode(confirmedMode);
    }
  }

  const activeMode = confirmedMode ?? storedMode;
  const groups: NavGroup[] = activeMode === 'money' ? MONEY_MENU_GROUPS : PROJECTS_MENU_GROUPS;
  // The card always offers the OTHER mode, never the one already showing.
  const switchTo = SWITCH_COPY[activeMode === 'money' ? 'projects' : 'money'];
  const SwitchIcon = switchTo.icon;

  return (
    <nav className={`${styles.sidebar} ${compact ? styles.sidebarCompact : ''}`} aria-label="Primary">
      <div className={styles.logoRow}>
        {compact ? (
          <Image src={logomark} alt="Dreda" width={26} height={26} />
        ) : (
          <Image src={fullLogo} alt="Dreda" height={20} style={{ width: 'auto' }} />
        )}
      </div>

      <div className={styles.groups}>
        {groups.map((group, groupIndex) => (
          <div className={styles.group} key={group.label ?? groupIndex}>
            {!compact && group.label && <span className={styles.groupLabel}>{group.label}</span>}
            {group.items.map(({ href, label, icon: Icon }) => {
              // Exact match only — Time's own "Home" (/projects) is a
              // path PREFIX of every other Time item's href (/projects/
              // calendar, /projects/all, /projects/analytics), so a
              // startsWith(href + '/') fallback here highlighted Home
              // alongside whichever item was actually current. Every real
              // destination in this menu is its own hub page, not a
              // parent of another item's page, so exact match is correct
              // for all of them.
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={compact ? label : undefined}
                >
                  <span className={styles.itemIcon}>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  {!compact && <span className={styles.itemLabel}>{label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.bottomGroup}>
        {/* The Money/Time mode switch — a plain click alternative to the
            swipe gesture (useSwipeModeSwitch) both hub screens already
            support. Restyled from a two-way segmented toggle into a single
            promo card offering only the OTHER mode (Lunacy/Images' own
            "Switch to Money" card) — compact/tablet width has no room for
            the card's copy, so it collapses to just the CTA circle. */}
        {compact ? (
          <button
            type="button"
            className={styles.switchCardCompact}
            onClick={() => router.push(switchTo.href)}
            aria-label={switchTo.heading}
            title={switchTo.heading}
          >
            <SwitchIcon size={16} strokeWidth={2.25} />
          </button>
        ) : (
          <div className={styles.switchCard}>
            {/* "Switch to" + the mode tag/badge share one row — not the
                tag on its own row above a second, redundant "Switch to X"
                sentence like an earlier version of this card had. */}
            <div className={styles.switchHeadingRow}>
              <span className={styles.switchHeadingText}>Switch to</span>
              <span className={styles.switchTag}>{switchTo.tag}</span>
            </div>
            <p className={styles.switchBody}>{switchTo.body}</p>
            {/* Label-then-badge, badge trailing with a plain diagonal
                arrow — not the mode's own Clock/Wallet icon, which is only
                shown on the compact circular CTA above where there's no
                label to pair it with. Not full-width either, unlike an
                earlier version of this button. */}
            <button type="button" className={styles.switchButton} onClick={() => router.push(switchTo.href)}>
              {switchTo.buttonLabel}
              <span className={styles.switchButtonBadge}>
                <ArrowUpRight size={12} strokeWidth={2.5} />
              </span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
