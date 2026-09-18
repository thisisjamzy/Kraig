'use client';

// The web shell's persistent left nav rail — mounted by app/(mobile)/
// layout.tsx only when useViewportMode() isn't 'mobile' (AppShellLayout's
// own header comment explains why that guarantees zero mobile impact).
// Unlike mobile's three separate mode-scoped bottom navs, this shows only
// ONE mode's own menu at a time (Money or Time/Projects), switched via the
// toggle at the bottom — a desktop sidebar has room to be richer than the
// phone tab bar per mode, not room to show all three tab bars stacked at
// once. Money's own menu is a curated desktop list (Dashboard/Budget/
// Transactions/Debts/Goals — several of these are mobile Quick Actions,
// not BottomNav tabs, since the phone bar deliberately stays to 3 items).
// Goals is a single link here, not an expanded sub-list — navigating
// between Goals' own Home/Analytics/Board lives inside the Goals page
// itself (GoalsHeader and friends), not duplicated again in this sidebar.
// Time's own menu reuses ProjectsBottomNav's own NAV_ITEMS unchanged. The
// active-item selector (left accent bar + tinted icon/text, not a solid
// filled pill) and the profile card + Money/Time toggle pinned at the
// bottom are modeled on Design/web/web2.jpg and web3.jpg respectively.
//
// 'tablet' (640-1023px) collapses to icon-only, showing just the
// logomark up top (public/logos/white_logomark.png) with a native title
// tooltip per item; 'desktop' (1024px+) shows the full lockup
// (public/logos/whitw_full.png) and full icon+label — same two-tier
// collapse the reference dashboards use (Design/web/web7.jpg, web8.jpg).
// Both logo files live in public/logos/ (the current, up-to-date set —
// not the older top-level logo_alt.png/logomark_alt.png this component
// used before), and are white-on-transparent already, matching this
// always-dark sidebar without needing a light/dark variant swap.

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronRight, Clock, CreditCard, History, Home, SlidersHorizontal, Target, Wallet } from 'lucide-react';
import fullLogo from '@/public/logos/whitw_full.png';
import logomark from '@/public/logos/white_logomark.png';
import { useViewportMode } from '@/src/shared/hooks/useViewportMode';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { NAV_ITEMS as PROJECTS_NAV_ITEMS } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import styles from './WebSidebar.module.css';

// Desktop-only — mobile's own Money tab bar (BottomNav.tsx) deliberately
// stays to 3 items (Home/Statistics/Budget), reaching Transactions/Debts/
// Goals through Home's own Quick Actions instead. The sidebar has the
// room to list them directly, so this doesn't reuse BottomNav's own
// NAV_ITEMS.
const MONEY_MENU = [
  { href: '/home', label: 'Dashboard', icon: Home },
  { href: '/budget', label: 'Budget', icon: SlidersHorizontal },
  { href: '/transactions', label: 'Transactions', icon: History },
  { href: '/debts', label: 'Debts', icon: CreditCard },
  { href: '/goals', label: 'Goals', icon: Target },
];

export function WebSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = useViewportMode();
  const compact = mode === 'tablet';
  const { user } = useFirebaseUser();
  // Same "money" vs "projects" fallback AppHeader's own ModeSwitch usage
  // already accepts — a Goals route falls into "money" too (Goals is a
  // single link inside Money's own menu, not its own mode), so being
  // anywhere in Goals keeps Money's menu showing rather than blanking out.
  const activeMode = navMode(pathname) === 'projects' ? 'projects' : 'money';
  const items = activeMode === 'money' ? MONEY_MENU : PROJECTS_NAV_ITEMS;

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
        <div className={styles.group}>
          {items.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname?.startsWith(`${href}/`);
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
      </div>

      <div className={styles.bottomGroup}>
        <Link href="/settings" className={styles.profileCard}>
          <span className={styles.profileAvatar}>{(user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}</span>
          {!compact && (
            <>
              <span className={styles.profileText}>
                <span className={styles.profileName}>{user?.displayName || 'You'}</span>
                <span className={styles.profileMeta}>{user?.email || 'Account'}</span>
              </span>
              <ChevronRight size={16} strokeWidth={2} className={styles.profileChevron} />
            </>
          )}
        </Link>

        {/* The Money/Time mode switch — a plain click alternative to the
            swipe gesture (useSwipeModeSwitch) both hub screens already
            support, restyled as a bottom-of-drawer toggle (Design/web/
            web3.jpg's own Light/Dark switch) rather than reusing
            ModeSwitch's component as-is, since that one's CSS assumes a
            light AppHeader background, not this always-dark sidebar. */}
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeToggleSegment} ${activeMode === 'money' ? styles.modeToggleSegmentActive : ''}`}
            onClick={() => router.push('/home')}
          >
            <Wallet size={14} strokeWidth={2} />
            {!compact && 'Money'}
          </button>
          <button
            type="button"
            className={`${styles.modeToggleSegment} ${activeMode === 'projects' ? styles.modeToggleSegmentActive : ''}`}
            onClick={() => router.push('/projects')}
          >
            <Clock size={14} strokeWidth={2} />
            {!compact && 'Time'}
          </button>
        </div>
      </div>
    </nav>
  );
}
