'use client';

// The sidebar for medium screens and up, drawn from Dreda.figcraft
// `Sidebar / Web` (Money) and `Sidebar / Time`: a white card with a 20px
// radius floating on the page. Top to bottom:
//   - the full logo and the collapse button;
//   - the module's page tree under its headings (PageTree): Tracking and
//     Budgeting, or The day and The work (no project list: the user found
//     it unhelpful, 15 Nov 2026);
//   - Money only: the Ready to pay card, with this month's ready count;
//   - footer: Settings, the profile row (its menu holds Account, the
//     Money / Time switch and Log out), then the mode and sync line.
// Search, notifications and the page's main action live in the header
// (TopBar). The right edge drags to resize between 200 and 400px.

import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Check, ChevronsLeft, ChevronsUpDown, LogOut, RefreshCw, Settings, Sun, User, Wallet } from 'lucide-react';
import { signOut } from 'firebase/auth';
import logoFull from '@/public/brand/dreda-full.png';
import { MODE_HOME, MODE_LABEL, modeOfPath, type AppMode } from '@/src/shared/config/pageTree';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { clearSignedIn } from '@/src/shared/config/authSession';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useReadyToPay } from '@/src/shared/hooks/useReadyToPay';
import { useSyncStatus } from '@/src/shared/hooks/useSyncStatus';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { PageTree } from './PageTree';
import { SIDEBAR_MAX, SIDEBAR_MIN } from './sidebarState';
import styles from './Sidebar.module.css';
import { useWebOnly } from '@/src/shared/device/useWebOnly';
import { useSettingsLink } from '@/src/shared/navigation/useSettingsLink';
import { usePathname } from 'next/navigation';
import { maskAmount } from '@/src/shared/hooks/usePrivacy';

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

const amount = (n: number) => maskAmount(Math.round(n).toLocaleString('en-US'));

/** Money's Ready to pay card: what this month's money already covers. */
function ReadyToPayCard({ onNavigate }: { onNavigate?: () => void }) {
  const { ready } = useReadyToPay();
  if (!ready.length) return null;
  const total = ready.reduce((sum, r) => sum + r.amount, 0);
  return (
    <Link href="/budget/ready" className={styles.readyCard} onClick={onNavigate}>
      <BadgeCheck size={18} strokeWidth={2} aria-hidden className={styles.readyIcon} />
      <span className={styles.readyText}>
        <span className={styles.readyTitle}>Ready to pay</span>
        <span className={styles.readySub}>{amount(total)} due this month</span>
      </span>
      <span className={styles.readyBadge}>{ready.length}</span>
    </Link>
  );
}

export function Sidebar({
  variant,
  width,
  onResize,
  touch,
  onNavigate,
  onCollapse,
}: {
  /** docked beside the page, floating (hover reveal) or overlay (medium). */
  variant: 'docked' | 'floating' | 'overlay';
  width: number;
  onResize?: (px: number) => void;
  touch: boolean;
  onNavigate?: () => void;
  onCollapse: () => void;
  /** Search now lives in the header; kept so callers need not change. */
  onSearch?: () => void;
}) {
  const settingsLink = useSettingsLink();
  useWebOnly('Sidebar');
  const router = useRouter();
  const { user } = useFirebaseUser();
  const mode = useAppMode();
  const sync = useSyncStatus();
  const [profileMenu, setProfileMenu] = useState<HTMLElement | null>(null);
  const name = user?.displayName || user?.email || 'You';

  // Drag the right edge to resize.
  const drag = useRef<{ x: number; w: number } | null>(null);

  async function logOut() {
    await signOut(getFirebaseAuth()).catch(() => {});
    clearSignedIn();
    router.push('/sign-in');
  }

  return (
    <nav className={styles.sidebar} data-variant={variant} data-touch={touch || undefined} style={{ width }} aria-label="Main navigation">
      <div className={styles.top}>
        <Link href={MODE_HOME[mode]} className={styles.logo} onClick={onNavigate} aria-label={`Dreda ${MODE_LABEL[mode]}, home`}>
          <Image src={logoFull} alt="" width={113} height={48} priority />
        </Link>
        <button type="button" className={styles.collapse} onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse sidebar (Ctrl or Cmd + \)">
          <ChevronsLeft size={18} strokeWidth={2} />
        </button>
      </div>

      <div className={styles.scroll}>
        <PageTree mode={mode} touch={touch} onNavigate={onNavigate} />
        {mode === 'money' && <ReadyToPayCard onNavigate={onNavigate} />}
      </div>

      <div className={styles.bottom}>
        <Link href={settingsLink('preferences')} scroll={false} className={styles.navRow} onClick={onNavigate}>
          <Settings size={20} strokeWidth={2} aria-hidden className={styles.rowGlyph} />
          <span className={styles.rowLabel}>Settings</span>
        </Link>
        <button type="button" className={styles.profile} onClick={(e) => setProfileMenu(e.currentTarget)} aria-haspopup="menu">
          <span className={styles.avatar} aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
          <span className={styles.who}>
            <span className={styles.whoName}>{name}</span>
            <span className={styles.whoPlan}>Personal</span>
          </span>
          <ChevronsUpDown size={20} strokeWidth={2} aria-hidden className={styles.rowGlyph} />
        </button>

        <p className={styles.sync} aria-live="polite">
          <RefreshCw size={14} strokeWidth={2} aria-hidden />
          {MODE_LABEL[mode]} mode · {sync}
        </p>
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

      {profileMenu && (
        <Popover anchor={profileMenu} label="Account" onClose={() => setProfileMenu(null)}>
          <div className={styles.menu} role="menu">
            <Link href={settingsLink('profile')} scroll={false} role="menuitem" className={styles.menuRow} data-row onClick={() => setProfileMenu(null)}>
              <User size={15} strokeWidth={2} aria-hidden /> Account
            </Link>
            <hr className={styles.menuDivider} />
            <p className={styles.menuLabel}>Module</p>
            {(['money', 'time'] as AppMode[]).map((m) => (
              <Link
                key={m}
                href={MODE_HOME[m]}
                role="menuitemradio"
                aria-checked={m === mode}
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setProfileMenu(null);
                  onNavigate?.();
                }}
              >
                {m === 'money' ? <Wallet size={15} strokeWidth={2} aria-hidden /> : <Sun size={15} strokeWidth={2} aria-hidden />}
                {MODE_LABEL[m]}
                {m === mode && <Check size={15} strokeWidth={2.5} aria-hidden className={styles.menuCheck} />}
              </Link>
            ))}
            <hr className={styles.menuDivider} />
            <button type="button" role="menuitem" className={styles.menuRow} data-row onClick={logOut}>
              <LogOut size={15} strokeWidth={2} aria-hidden /> Log out
            </button>
          </div>
        </Popover>
      )}
    </nav>
  );
}
