'use client';

// The top bar for medium screens and up — inside the content area (not
// across the drawer), 64px plus the top safe area, sticky. Left: the menu
// button (drawer hidden or in rail), the page title, then whatever the page
// puts in its slot (TopBarSlot.tsx). Right: quick search, notifications,
// and the profile when the drawer isn't showing it.

import { useMemo, useRef, useState, type Ref } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Menu, Search } from 'lucide-react';
import { pageTitle, WIDE_NAV } from '@/src/shared/config/wideNav';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import styles from './TopBar.module.css';

const SEARCHABLE = [
  ...WIDE_NAV.time,
  ...WIDE_NAV.money,
  { href: '/tasks', label: 'All tasks' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/debts', label: 'Debts' },
  { href: '/add-transaction', label: 'Add transaction' },
  { href: '/settings', label: 'Settings' },
  { href: '/settings/google-calendar', label: 'Google Calendar' },
].filter((item, i, all) => all.findIndex((x) => x.label === item.label) === i);

export function TopBar({
  showMenu,
  onMenu,
  showProfile,
  slotRef,
  searchRef,
}: {
  showMenu: boolean;
  onMenu: () => void;
  showProfile: boolean;
  slotRef: Ref<HTMLDivElement>;
  searchRef: Ref<HTMLInputElement>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useFirebaseUser();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? SEARCHABLE.filter((r) => r.label.toLowerCase().includes(q)) : SEARCHABLE).slice(0, 8);
  }, [query]);

  function go(href: string) {
    router.push(href);
    setQuery('');
    setOpen(false);
  }

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        {showMenu && (
          <button type="button" className={styles.iconButton} onClick={onMenu} aria-label="Open navigation" title="Open navigation ( [ )">
            <Menu size={20} strokeWidth={2} />
          </button>
        )}
        <h1 className={styles.title}>{pageTitle(pathname)}</h1>
        <div ref={slotRef} className={styles.slot} />
      </div>

      <div className={styles.right}>
        <div
          className={styles.search}
          ref={wrapRef}
          onBlur={(e) => {
            if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
        >
          <Search size={16} strokeWidth={2} className={styles.searchIcon} aria-hidden />
          <input
            ref={searchRef}
            className={styles.searchInput}
            placeholder="Search"
            aria-label="Search pages"
            role="combobox"
            aria-expanded={open}
            aria-controls="topbar-search-results"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) go(matches[0].href);
              if (e.key === 'Escape') {
                setOpen(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {open && matches.length > 0 && (
            <ul id="topbar-search-results" className={styles.results} role="listbox">
              {matches.map((m) => (
                <li key={m.href + m.label} role="option" aria-selected={false}>
                  <button type="button" className={styles.result} onMouseDown={(e) => e.preventDefault()} onClick={() => go(m.href)}>
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link href="/notifications" className={styles.iconButton} aria-label="Notifications" title="Notifications">
          <Bell size={19} strokeWidth={1.9} />
        </Link>
        {showProfile && (
          <Link href="/settings" className={styles.avatar} aria-label="Profile and settings" title="Profile and settings">
            {(user?.displayName || user?.email || 'Y').charAt(0).toUpperCase()}
          </Link>
        )}
      </div>
    </header>
  );
}
