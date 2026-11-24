'use client';

// The app shell for medium screens and up: the sidebar beside a content
// column with the top bar and the page. Phones never render this —
// app/(mobile)/layout.tsx keeps the app header and bottom navs there.
//
// Sidebar (Sidebar.tsx), per device class:
//   expanded / large: docked and resizable (200 to 400px); collapsed with
//     "«" or Ctrl/Cmd + \, then hovering the left screen edge slides it out
//     as a floating panel and the top bar's "»" docks it again;
//   medium: collapsed by default, "»" opens it as a 280px overlay over the
//     content with a dim backdrop (tap it, Escape or swipe left to close).
// Ctrl/Cmd + K or the header's Search pill opens search.
//
// The header (TopBar.tsx, Dreda.figcraft `Top bar`) carries the title, so
// every page has exactly one: pages hand theirs in with <TopBarTitle>, and a
// page that doesn't gets its route's name. Page controls (TopBarControls)
// sit in the header beside Search. The page area is full width or, for
// pages without a wide layout, the standard 900px column.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { fallbackTitle } from '@/src/shared/config/pageTree';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TopBarActionsContext, TopBarPrimaryContext, TopBarSlotContext, TopBarTitleContext } from './TopBarSlot';
import { SearchPalette } from './SearchPalette';
import { useSidebarCollapsed, useSidebarWidth } from './sidebarState';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  const { deviceClass, finePointer } = useLayout();
  const pathname = usePathname();
  const [width, setWidth] = useSidebarWidth();
  const [collapsed, setCollapsed] = useSidebarCollapsed(deviceClass);
  const [peek, setPeek] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [searching, setSearching] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const [primarySlot, setPrimarySlot] = useState<HTMLDivElement | null>(null);
  const [amountsHidden] = useAmountsHidden();
  const medium = deviceClass === 'medium';
  const touch = !finePointer;

  // Every page uses the whole content area (owner, 24 Nov 2026): no
  // centred reading column, whatever the page.

  // Close the overlay and the hover peek on navigation — "adjust state
  // during render".
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (overlay) setOverlay(false);
    if (peek) setPeek(false);
  }

  const toggle = useCallback(() => {
    if (medium) setOverlay((o) => !o);
    else setCollapsed(!collapsed);
  }, [medium, collapsed, setCollapsed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!finePointer) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === '\\') {
        e.preventDefault();
        toggle();
      } else if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearching(true);
      } else if (e.key === 'Escape' && overlay) {
        setOverlay(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle, overlay, finePointer]);

  // Swipe left on the overlay closes it.
  const swipe = useRef<number | null>(null);
  const docked = !medium && !collapsed;

  return (
    <div className={styles.shell} data-device={deviceClass} data-sidebar={docked ? 'docked' : 'hidden'}>
      <a href="#main-content" className={styles.skip}>
        Skip to content
      </a>
      {docked && (
        <div className={styles.drawer}>
          <Sidebar variant="docked" width={width} onResize={setWidth} touch={touch} onCollapse={() => setCollapsed(true)} onSearch={() => setSearching(true)} />
        </div>
      )}

      {/* Collapsed (expanded / large): hovering the left edge slides it out. */}
      {!medium && collapsed && (
        <>
          <div className={styles.edge} onMouseEnter={() => setPeek(true)} aria-hidden />
          {peek && (
            <div className={styles.floating} onMouseLeave={() => setPeek(false)}>
              <Sidebar variant="floating" width={width} touch={touch} onCollapse={() => setPeek(false)} onSearch={() => setSearching(true)} />
            </div>
          )}
        </>
      )}

      {medium && overlay && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className={styles.backdrop} aria-label="Close navigation" onClick={() => setOverlay(false)} />
          <div
            className={styles.overlayDrawer}
            onPointerDown={(e) => {
              swipe.current = e.clientX;
            }}
            onPointerUp={(e) => {
              if (swipe.current !== null && e.clientX - swipe.current < -60) setOverlay(false);
              swipe.current = null;
            }}
          >
            <Sidebar
              variant="overlay"
              width={280}
              touch={touch}
              onNavigate={() => setOverlay(false)}
              onCollapse={() => setOverlay(false)}
              onSearch={() => {
                setOverlay(false);
                setSearching(true);
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.main}>
        <TopBar
          showExpand={!docked}
          onExpand={() => (medium ? setOverlay(true) : setCollapsed(false))}
          onSearch={() => setSearching(true)}
          fallbackTitle={fallbackTitle(pathname)}
          setTitleSlot={setTitleSlot}
          setControlsSlot={setSlot}
          setActionsSlot={setActionsSlot}
          setPrimarySlot={setPrimarySlot}
        />
        <TopBarSlotContext.Provider value={slot}>
          <TopBarTitleContext.Provider value={titleSlot}>
            <TopBarActionsContext.Provider value={actionsSlot}>
            <TopBarPrimaryContext.Provider value={primarySlot}>
            <main id="main-content" className={styles.content} tabIndex={-1}>
              {/* Hiding amounts redraws the page, so every figure follows the switch. */}
              <div key={amountsHidden ? 'hidden' : 'shown'} className={styles.page}>
                {children}
              </div>
            </main>
            </TopBarPrimaryContext.Provider>
            </TopBarActionsContext.Provider>
          </TopBarTitleContext.Provider>
        </TopBarSlotContext.Provider>
      </div>

      {searching && <SearchPalette onClose={() => setSearching(false)} />}
    </div>
  );
}
