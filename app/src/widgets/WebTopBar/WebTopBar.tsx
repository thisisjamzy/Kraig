'use client';

// The web shell's top bar — mounted alongside WebSidebar only when
// useViewportMode() isn't 'mobile'. Replaces AppHeader visually in web
// mode (AppHeader itself is untouched and keeps rendering as-is for
// mobile), reusing the exact same Notifications/Settings hrefs AppHeader
// already links to rather than re-deciding what belongs here. Sticky
// (position: sticky, see WebTopBar.module.css) so it stays visible while a
// tall dashboard page scrolls beneath it, and carries a "+" create button —
// desktop/tablet's own create entry point now that mobile's own bottom-nav
// FAB switches Money<->Time mode instead of creating anything (Money mode
// still links straight to /add-transaction; Projects mode opens the
// three-way sheet via ProjectsBottomNav's exported CREATE_OPTIONS).
//
// The money home route ('/home' only — every other web route keeps the
// plain compact bar exactly as before) additionally renders Lunacy/Images/
// Time Dashboaard.png's own header treatment: a large bold "Dashboard"
// title, a real quick-jump search (filters this app's own hub/settings
// routes — not a placeholder, Enter/click actually navigates), and a
// profile block reading the signed-in user. Scoped to this one route so
// every other screen's header is untouched.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, Plus, Search, User } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { Modal } from '@/src/widgets/Modal/Modal';
import { CREATE_OPTIONS } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { iconTint } from '@/src/viewmodels/iconTint';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import styles from './WebTopBar.module.css';

const SECTION_TITLE: Record<string, string> = {
  money: 'Money',
  projects: 'Projects',
  goals: 'Goals',
};

// The money home page's own quick-jump search — a small, real feature (not
// a cosmetic placeholder), so it's scoped to the routes worth jumping to
// directly rather than every route in the app.
const QUICK_NAV_ROUTES = [
  { label: 'Dashboard', href: '/home' },
  { label: 'Budget', href: '/budget' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Wallets', href: '/wallets' },
  { label: 'Statistics', href: '/statistics' },
  { label: 'Debts', href: '/debts' },
  { label: 'Goals', href: '/goals' },
  { label: 'Payments calendar', href: '/payments' },
  { label: 'Add transaction', href: '/add-transaction' },
  { label: 'Settings', href: '/settings' },
];

export function WebTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = navMode(pathname);
  const isHome = pathname === '/home';
  const title = isHome ? 'Dashboard' : (SECTION_TITLE[mode] ?? 'Dreda');
  const [createOpen, setCreateOpen] = useState(false);
  const { user } = useFirebaseUser();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(
    () =>
      query.trim()
        ? QUICK_NAV_ROUTES.filter((route) => route.label.toLowerCase().includes(query.trim().toLowerCase()))
        : QUICK_NAV_ROUTES,
    [query]
  );

  useEffect(() => {
    if (!searchOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [searchOpen]);

  function goToMatch(href: string) {
    router.push(href);
    setQuery('');
    setSearchOpen(false);
  }

  return (
    <header className={`${styles.topBar} ${isHome ? styles.topBarRich : ''}`}>
      <h1 className={`${styles.title} ${isHome ? styles.titleRich : ''}`}>{title}</h1>

      {isHome && (
        <div className={styles.searchWrap} ref={searchRef}>
          <Search size={16} strokeWidth={2} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches[0]) goToMatch(matches[0].href);
              if (event.key === 'Escape') setSearchOpen(false);
            }}
          />
          {searchOpen && matches.length > 0 && (
            <div className={styles.searchResults}>
              {matches.map((route) => (
                <button key={route.href} type="button" className={styles.searchResult} onClick={() => goToMatch(route.href)}>
                  {route.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        {mode === 'projects' ? (
          <button
            type="button"
            className={`${styles.addButton} ${isHome ? styles.iconButtonRich : ''}`}
            aria-label="Create"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={18} strokeWidth={2.25} />
          </button>
        ) : (
          <Link
            href="/add-transaction"
            className={`${styles.addButton} ${isHome ? styles.iconButtonRich : ''}`}
            aria-label="Add transaction"
          >
            <Plus size={18} strokeWidth={2.25} />
          </Link>
        )}
        <Link
          href="/notifications"
          className={`${styles.iconButton} ${isHome ? styles.iconButtonRich : ''}`}
          aria-label="Notifications"
        >
          <Bell size={18} strokeWidth={1.75} />
        </Link>
        {!isHome && (
          <Link href="/settings" className={styles.iconButton} aria-label="Settings">
            <User size={18} strokeWidth={1.75} />
          </Link>
        )}
        {isHome && (
          <Link href="/settings" className={styles.profileBlock}>
            <span className={styles.profileAvatar}>{(user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}</span>
            <span className={styles.profileText}>
              <span className={styles.profileName}>{user?.displayName || 'You'}</span>
              <span className={styles.profileMeta}>{user?.email || 'Account'}</span>
            </span>
          </Link>
        )}
      </div>

      {createOpen && (
        <Modal title="Create" onClose={() => setCreateOpen(false)}>
          <div className={styles.sheetList}>
            {CREATE_OPTIONS.map(({ href, label, icon: Icon }, index) => (
              <Link key={href} href={href} className={styles.sheetOption} onClick={() => setCreateOpen(false)}>
                <span className={styles.sheetOptionIcon} style={{ background: iconTint(index) }}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.sheetOptionLabel}>{label}</span>
              </Link>
            ))}
          </div>
        </Modal>
      )}
    </header>
  );
}
