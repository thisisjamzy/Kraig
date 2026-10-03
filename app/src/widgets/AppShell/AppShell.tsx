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
// Ctrl/Cmd + K opens search (fine pointers only; the sidebar's Search row
// works everywhere).
//
// Pages draw their own title (useBreadcrumb / useOwnsTitle); a page that
// doesn't gets one from the page tree here, so every page has exactly one.
// Page controls (TopBarControls) render in a row under that title, not in
// the top bar. The page area is full width (capped at 1600px) or, for
// pages without a wide layout, the standard 900px column; the top bar's
// "..." switches it per page.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { fallbackTitle } from '@/src/shared/config/pageTree';
import { useLocationSearch } from '@/src/shared/navigation/locationSearch';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TopBarSlotContext } from './TopBarSlot';
import { SearchPalette } from './SearchPalette';
import { usePageMeta, usePageWidth } from './breadcrumb';
import { useSidebarCollapsed, useSidebarWidth } from './sidebarState';
import { isWideLayoutRoute } from './wideRoutes';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  const { deviceClass, finePointer } = useLayout();
  const pathname = usePathname();
  const search = useLocationSearch(pathname);
  const [width, setWidth] = useSidebarWidth();
  const [collapsed, setCollapsed] = useSidebarCollapsed(deviceClass);
  const [peek, setPeek] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [searching, setSearching] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const meta = usePageMeta();
  const medium = deviceClass === 'medium';
  const touch = !finePointer;

  const wide = isWideLayoutRoute(pathname);
  const pageWidth = usePageWidth(pathname, wide ? 'full' : 'standard');

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
    <div className={styles.shell} data-device={deviceClass}>
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
        <TopBar showExpand={!docked} onExpand={() => (medium ? setOverlay(true) : setCollapsed(false))} compactCrumbs={medium} defaultWidth={wide ? 'full' : 'standard'} />
        <TopBarSlotContext.Provider value={slot}>
          <main id="main-content" className={styles.content} tabIndex={-1}>
            <div className={pageWidth === 'full' ? styles.page : styles.column}>
              {!meta.titled && <h1 className={styles.fallbackTitle}>{fallbackTitle(pathname, search)}</h1>}
              <div ref={setSlot} className={styles.controls} />
              {children}
            </div>
          </main>
        </TopBarSlotContext.Provider>
      </div>

      {searching && <SearchPalette onClose={() => setSearching(false)} />}
    </div>
  );
}
