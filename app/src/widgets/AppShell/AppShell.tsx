'use client';

// The app shell for medium screens and up: side drawer (SideNav) beside a
// content column with the top bar (TopBar) and the page. Phones never
// render this — app/(mobile)/layout.tsx keeps AppHeader, the bottom navs
// and the floating button for compact screens, untouched.
//
// Drawer states per device class (drawerState.ts):
//   expanded / large: full ⇄ rail ⇄ hidden; hidden opens as an overlay
//   medium: rail or hidden; "full" is always the overlay (no room beside)
// "[" toggles it on devices with a keyboard. The page area is capped at
// 1600px and centred; pages that aren't laid out for wide screens yet
// render in a centred reading column instead of stretching.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { TopBarSlotContext } from './TopBarSlot';
import { useDrawerPref } from './drawerState';
import { isWideLayoutRoute } from './wideRoutes';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  const { deviceClass, finePointer } = useLayout();
  const pathname = usePathname();
  const [pref, setPref] = useDrawerPref(deviceClass);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Medium never docks the full drawer.
  const docked: 'full' | 'rail' | 'hidden' = deviceClass === 'medium' && pref === 'full' ? 'rail' : pref;

  // Close the overlay on navigation — "adjust state during render".
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (overlayOpen) setOverlayOpen(false);
  }

  const openMenu = useCallback(() => {
    if (docked === 'hidden' || deviceClass === 'medium') setOverlayOpen(true);
    else setPref('full');
  }, [docked, deviceClass, setPref]);

  const toggle = useCallback(() => {
    if (overlayOpen) return setOverlayOpen(false);
    if (deviceClass === 'medium') return setPref(docked === 'rail' ? 'hidden' : 'rail');
    setPref(docked === 'full' ? 'rail' : 'full');
  }, [overlayOpen, deviceClass, docked, setPref]);

  // "[" toggles the drawer; "/" focuses search (not while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') {
        e.preventDefault();
        toggle();
      } else if (e.key === '/' && !document.querySelector('[role="dialog"], [data-panel-open]')) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && overlayOpen) {
        setOverlayOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle, overlayOpen]);

  const touch = !finePointer;
  const wide = isWideLayoutRoute(pathname);

  return (
    <div className={styles.shell} data-device={deviceClass}>
      <a href="#main-content" className={styles.skip}>
        Skip to content
      </a>
      {docked !== 'hidden' && (
        <div className={styles.drawer}>
          <SideNav
            variant={docked === 'full' ? 'full' : 'rail'}
            touch={touch}
            onCollapse={() => (deviceClass === 'medium' || docked === 'rail' ? setPref('hidden') : setPref('rail'))}
            collapseLabel={docked === 'full' ? 'Collapse' : 'Hide'}
          />
        </div>
      )}

      {overlayOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className={styles.backdrop} aria-label="Close navigation" onClick={() => setOverlayOpen(false)} />
          <div className={styles.overlayDrawer}>
            <SideNav
              variant="overlay"
              touch={touch}
              onNavigate={() => setOverlayOpen(false)}
              onCollapse={() => setOverlayOpen(false)}
              collapseLabel="Close"
            />
          </div>
        </div>
      )}

      <div className={styles.main}>
        <TopBar
          showMenu={docked !== 'full'}
          onMenu={openMenu}
          showProfile={docked === 'hidden'}
          slotRef={setSlot}
          searchRef={searchRef}
        />
        <TopBarSlotContext.Provider value={slot}>
          <main id="main-content" className={styles.content} data-wide={wide || undefined} tabIndex={-1}>
            <div className={wide ? styles.page : styles.column}>{children}</div>
          </main>
        </TopBarSlotContext.Provider>
      </div>
    </div>
  );
}
