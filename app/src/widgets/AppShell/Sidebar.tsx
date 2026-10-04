'use client';

// The sidebar for medium screens and up, in Notion's style: a light neutral
// panel with a 1px right border, 30px rows, muted text, a grey hover and a
// slightly darker grey for the current page. Top to bottom:
//   - the workspace switcher (logomark, "Money" or "Time", chevron): both
//     modules, account and log out;
//   - quick actions: Search, Home, Ready to pay (with its count), and
//     Add transaction or New task as a plain row;
//   - Favorites (hidden when empty);
//   - the module's page tree (PageTree);
//   - the sync status line, Settings and the profile.
// "«" (shown on hover, top right) collapses it; the right edge drags to
// resize it between 200 and 400px.

import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BadgeCheck, Bell, Check, ChevronDown, ChevronsLeft, Home, LogOut, Plus, Search, Settings, Sun, User } from 'lucide-react';
import { signOut } from 'firebase/auth';
import logomark from '@/public/logos/black_logomark.png';
import { MODE_HOME, MODE_LABEL, modeOfPath, type AppMode } from '@/src/shared/config/pageTree';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { clearSignedIn } from '@/src/shared/config/authSession';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useReadyToPayCount } from '@/src/shared/hooks/useReadyToPay';
import { useSyncStatus } from '@/src/shared/hooks/useSyncStatus';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { FavoritesSection, PageTree } from './PageTree';
import { SIDEBAR_MAX, SIDEBAR_MIN } from './sidebarState';
import styles from './Sidebar.module.css';
import { NotificationCount } from '@/src/widgets/Notifications/NotificationBell';
import { useWebOnly } from '@/src/shared/device/useWebOnly';

const MODE_KEY = 'dreda.mode';

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function readStoredMode(): AppMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'money' ? 'money' : 'time';
  } catch {
    return 'time';
  }
}

/** The module the sidebar shows: the page's own, else the last one shown. */
export function useAppMode(): AppMode {
  const pathname = usePathname();
  const routeMode = modeOfPath(pathname);
  const [stored, setStored] = useState<AppMode>(readStoredMode);
  if (routeMode && routeMode !== stored) {
    setStored(routeMode);
    try {
      window.localStorage.setItem(MODE_KEY, routeMode);
    } catch {
      // Not remembered across reloads.
    }
  }
  return routeMode ?? stored;
}

export function Sidebar({
  variant,
  width,
  onResize,
  touch,
  onNavigate,
  onCollapse,
  onSearch,
}: {
  /** docked beside the page, floating (hover reveal) or overlay (medium). */
  variant: 'docked' | 'floating' | 'overlay';
  width: number;
  onResize?: (px: number) => void;
  touch: boolean;
  onNavigate?: () => void;
  onCollapse: () => void;
  onSearch: () => void;
}) {
  useWebOnly('Sidebar');
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useFirebaseUser();
  const mode = useAppMode();
  const taskPanel = useTaskPanel();
  const ready = useReadyToPayCount();
  const sync = useSyncStatus();
  const [switcher, setSwitcher] = useState<HTMLElement | null>(null);
  const name = user?.displayName || user?.email || 'You';

  // Drag the right edge to resize.
  const drag = useRef<{ x: number; w: number } | null>(null);

  async function logOut() {
    await signOut(getFirebaseAuth()).catch(() => {});
    clearSignedIn();
    router.push('/');
  }

  const row = (href: string, label: string, Icon: typeof Home, extra?: React.ReactNode) => (
    <Link href={href} className={styles.quickRow} aria-current={pathname === href.split('?')[0] ? 'page' : undefined} onClick={onNavigate}>
      <Icon size={18} strokeWidth={1.75} aria-hidden className={styles.rowGlyph} />
      <span className={styles.rowLabel}>{label}</span>
      {extra}
    </Link>
  );

  return (
    <nav className={styles.sidebar} data-variant={variant} data-touch={touch || undefined} style={{ width }} aria-label="Main navigation">
      <div className={styles.top}>
        <button type="button" className={styles.switcher} onClick={(e) => setSwitcher(e.currentTarget)} aria-haspopup="menu" aria-label={`${MODE_LABEL[mode]}, switch module`}>
          <Image src={logomark} alt="" width={20} height={20} />
          <span className={styles.switcherLabel}>{MODE_LABEL[mode]}</span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" className={styles.collapse} onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse sidebar (Ctrl or Cmd + \)">
          <ChevronsLeft size={18} strokeWidth={2} />
        </button>
      </div>

      <div className={styles.scroll}>
        <div className={styles.quick}>
          <button type="button" className={styles.quickRow} onClick={onSearch}>
            <Search size={18} strokeWidth={1.75} aria-hidden className={styles.rowGlyph} />
            <span className={styles.rowLabel}>Search</span>
            {!touch && <kbd className={styles.kbd}>{isMac() ? '⌘K' : 'Ctrl K'}</kbd>}
          </button>
          {mode === 'money' ? (
            <>
              {row(MODE_HOME[mode], 'Home', Home)}
              {row('/notifications', 'Notifications', Bell, <NotificationCount className={styles.count} />)}
              {row('/budget/ready', 'Ready to pay', BadgeCheck, ready ? <span className={styles.count}>{ready}</span> : null)}
              {row('/add-transaction', 'Add transaction', Plus)}
            </>
          ) : (
            <>
              {row('/projects', 'Today', Sun)}
              {row('/notifications', 'Notifications', Bell, <NotificationCount className={styles.count} />)}
              <Link href={taskPanel.hrefFor('new')} scroll={false} className={styles.quickRow} onClick={onNavigate}>
                <Plus size={18} strokeWidth={1.75} aria-hidden className={styles.rowGlyph} />
                <span className={styles.rowLabel}>New task</span>
              </Link>
            </>
          )}
        </div>

        <FavoritesSection touch={touch} onNavigate={onNavigate} />
        <PageTree mode={mode} touch={touch} onNavigate={onNavigate} />
      </div>

      <div className={styles.bottom}>
        <p className={styles.sync} aria-live="polite">
          {sync}
        </p>
        {row('/settings', 'Settings', Settings)}
        <Link href="/settings" className={styles.profile} onClick={onNavigate}>
          <span className={styles.avatar} aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
          <span className={styles.rowLabel}>{user?.displayName || user?.email || 'You'}</span>
        </Link>
      </div>

      {variant === 'docked' && onResize && (
        <span
          className={styles.resizer}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') onResize(width - 16);
            if (e.key === 'ArrowRight') onResize(width + 16);
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) onResize(drag.current.w + e.clientX - drag.current.x);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        />
      )}

      {switcher && (
        <Popover anchor={switcher} label="Switch module" onClose={() => setSwitcher(null)}>
          <div className={styles.menu} role="menu">
            {(['money', 'time'] as AppMode[]).map((m) => (
              <Link
                key={m}
                href={MODE_HOME[m]}
                role="menuitem"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setSwitcher(null);
                  onNavigate?.();
                }}
              >
                <Image src={logomark} alt="" width={16} height={16} />
                {MODE_LABEL[m]}
                {m === mode && <Check size={14} strokeWidth={2.5} aria-hidden className={styles.menuCheck} />}
              </Link>
            ))}
            <hr className={styles.menuDivider} />
            <Link href="/settings" role="menuitem" className={styles.menuRow} data-row onClick={() => setSwitcher(null)}>
              <User size={15} strokeWidth={2} aria-hidden /> Account
            </Link>
            <button type="button" role="menuitem" className={styles.menuRow} data-row onClick={logOut}>
              <LogOut size={15} strokeWidth={2} aria-hidden /> Log out
            </button>
          </div>
        </Popover>
      )}
    </nav>
  );
}
