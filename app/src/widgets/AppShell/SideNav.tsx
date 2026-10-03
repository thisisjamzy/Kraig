'use client';

// The side drawer for medium screens and up — replaces the phone's bottom
// navs and floating button, which never render at these sizes. Three
// looks: `full` (256px, icons and labels), `rail` (80px, icons; a tooltip
// on hover, a small label under each icon on touch), and the same full
// drawer as an overlay (`overlay`) when it's hidden or on medium screens.
//
// Top to bottom: logo, the Time / Money switch, the mode's primary action
// (+ New task / + Add transaction), the mode's pages, then sync status,
// Settings and the profile.

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronsLeft, Clock, PanelLeftClose, Plus, Settings, Wallet } from 'lucide-react';
import fullLogo from '@/public/logos/black_full.png';
import logomark from '@/public/logos/black_logomark.png';
import { MODE_HOME, WIDE_NAV, isNavItemActive, modeOfPath, type AppMode } from '@/src/shared/config/wideNav';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { CalendarSyncStatus } from '@/src/widgets/CalendarSyncStatus/CalendarSyncStatus';
import { OPEN_TAB_EVENT, useLocationSearch } from '@/src/shared/navigation/locationSearch';
import { useReadyToPayCount } from '@/src/shared/hooks/useReadyToPay';
import styles from './SideNav.module.css';

const MODE_KEY = 'dreda.mode';

function readStoredMode(): AppMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'money' ? 'money' : 'time';
  } catch {
    return 'time';
  }
}

export function SideNav({
  variant,
  touch,
  onNavigate,
  onCollapse,
  collapseLabel,
}: {
  variant: 'full' | 'rail' | 'overlay';
  /** Coarse pointer: rail items get a small label under the icon. */
  touch: boolean;
  /** Called after following a link (closes the overlay). */
  onNavigate?: () => void;
  onCollapse: () => void;
  collapseLabel: string;
}) {
  const pathname = usePathname();
  const { user } = useFirebaseUser();
  const taskPanel = useTaskPanel();
  const rail = variant === 'rail';
  const search = useLocationSearch(pathname);

  // A shared route (Settings, Notifications) keeps the last mode shown —
  // "adjust state during render", not an effect.
  const routeMode = modeOfPath(pathname);
  const [storedMode, setStoredMode] = useState<AppMode>(readStoredMode);
  if (routeMode && routeMode !== storedMode) {
    setStoredMode(routeMode);
    try {
      window.localStorage.setItem(MODE_KEY, routeMode);
    } catch {
      // Not remembered across reloads.
    }
  }
  const mode = routeMode ?? storedMode;
  const items = WIDE_NAV[mode];
  const name = user?.displayName || user?.email || 'You';
  const readyToPay = useReadyToPayCount();
  const labelOf = (item: (typeof items)[number]) => (item.count === 'readyToPay' && readyToPay ? `${item.label} (${readyToPay})` : item.label);

  const itemLabel = (label: string) =>
    rail ? (touch ? <span className={styles.railLabel}>{label}</span> : null) : <span className={styles.label}>{label}</span>;

  return (
    <nav
      className={styles.nav}
      data-variant={variant}
      data-touch={touch || undefined}
      aria-label="Main navigation"
    >
      <div className={styles.logoRow}>
        {rail ? (
          <Image src={logomark} alt="Dreda" width={28} height={28} />
        ) : (
          <Image src={fullLogo} alt="Dreda" height={22} style={{ width: 'auto' }} priority />
        )}
      </div>

      {/* Time / Money */}
      <div className={styles.modeSwitch} role="group" aria-label="Mode">
        {(['time', 'money'] as AppMode[]).map((m) => {
          const Icon = m === 'time' ? Clock : Wallet;
          const label = m === 'time' ? 'Time' : 'Money';
          return (
            <Link
              key={m}
              href={MODE_HOME[m]}
              className={styles.modeOption}
              aria-current={mode === m ? 'true' : undefined}
              aria-label={rail ? label : undefined}
              title={rail ? label : undefined}
              onClick={onNavigate}
            >
              <Icon size={16} strokeWidth={2.25} aria-hidden />
              {!rail && label}
            </Link>
          );
        })}
      </div>

      {/* The mode's primary action — replaces the phone's floating button. */}
      {mode === 'time' ? (
        <Link
          href={taskPanel.hrefFor('new')}
          scroll={false}
          className={styles.primary}
          aria-label={rail ? 'New task' : undefined}
          title={rail ? 'New task' : undefined}
          onClick={onNavigate}
        >
          <Plus size={18} strokeWidth={2.5} aria-hidden />
          {!rail && 'New task'}
        </Link>
      ) : (
        <Link
          href="/add-transaction"
          className={styles.primary}
          aria-label={rail ? 'Add transaction' : undefined}
          title={rail ? 'Add transaction' : undefined}
          onClick={onNavigate}
        >
          <Plus size={18} strokeWidth={2.5} aria-hidden />
          {!rail && 'Add transaction'}
        </Link>
      )}

      <ul className={styles.items}>
        {items.map((item) => {
          const active = isNavItemActive(item, items, pathname, search);
          const Icon = item.icon;
          // In the rail, Planning's parent row is dropped — its pages
          // show as ordinary icons.
          if (rail && item.child === undefined && items.some((i) => i.child && i.href === item.href)) return null;
          return (
            <li key={`${item.label}-${item.href}`}>
              <Link
                href={item.href}
                className={styles.item}
                data-child={(!rail && item.child) || undefined}
                aria-current={active ? 'page' : undefined}
                aria-label={rail && !touch ? labelOf(item) : undefined}
                title={rail ? labelOf(item) : undefined}
                onClick={() => {
                  // Already on Planning: switch its tab in place.
                  if (item.tab && pathname === '/budget') window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: item.tab }));
                  onNavigate?.();
                }}
              >
                <Icon size={18} strokeWidth={2} aria-hidden />
                {itemLabel(labelOf(item))}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.spacer} />

      <div className={styles.bottom}>
        {!rail && (
          <div className={styles.sync}>
            <CalendarSyncStatus />
          </div>
        )}
        <Link
          href="/settings"
          className={styles.item}
          aria-current={pathname?.startsWith('/settings') ? 'page' : undefined}
          aria-label={rail && !touch ? 'Settings' : undefined}
          title={rail ? 'Settings' : undefined}
          onClick={onNavigate}
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
          {itemLabel('Settings')}
        </Link>
        <Link href="/settings" className={styles.profile} title={rail ? name : undefined} onClick={onNavigate}>
          <span className={styles.avatar} aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
          {!rail && (
            <span className={styles.profileText}>
              <span className={styles.profileName}>{user?.displayName || 'You'}</span>
              {user?.email && <span className={styles.profileMeta}>{user.email}</span>}
            </span>
          )}
          {rail && <span className={styles.srOnly}>Profile</span>}
        </Link>
        <button type="button" className={styles.collapse} onClick={onCollapse} aria-label={collapseLabel} title={collapseLabel}>
          {variant === 'overlay' ? <PanelLeftClose size={18} strokeWidth={2} aria-hidden /> : <ChevronsLeft size={18} strokeWidth={2} aria-hidden />}
          {!rail && <span className={styles.label}>{collapseLabel}</span>}
        </button>
      </div>
    </nav>
  );
}
