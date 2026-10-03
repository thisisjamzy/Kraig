'use client';

import type { ReactNode } from 'react';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useOwnsTitle } from '@/src/widgets/AppShell/breadcrumb';
import styles from './ScreenHeader.module.css';

// The one top bar every full-screen page uses (everything except the hub
// routes, which get AppHeader's logo bar instead): safe-area aware (content
// starts --header-gap below the device's real top inset while the
// background runs up behind the status bar), a 56px row, a left slot
// (back / close / menu), a title and a right slot (actions). Every button
// or link in a slot gets at least a 44x44 tap area, entirely below the
// inset.
//
// Render it as the page's FIRST child, inside a page with no top padding
// of its own and a horizontal gutter of --screen-gutter (default
// var(--space-lg)) — it bleeds out to the page edges from there. Page-level
// overrides, set once on the page:
//   --screen-header-bg      background (default var(--color-page))
//   --screen-header-pad-x   side padding (default: 24px, clear of a notch)
//
// `large` is the big hub-style title (Focus, Insights); `center` centers
// the title between the slots (close / title / save forms, Calendar).
//
// Medium screens and up (inside the app shell): no back arrow or close
// button (the top bar's breadcrumb navigates), the title as the page's one
// Notion-style title, and the actions on its right. The shell then adds no
// title of its own.
export function ScreenHeader({
  left,
  title,
  right,
  large = false,
  center = false,
  sticky = true,
  className,
}: {
  left?: ReactNode;
  title?: ReactNode;
  right?: ReactNode;
  large?: boolean;
  center?: boolean;
  sticky?: boolean;
  className?: string;
}) {
  const inShell = useHasTopBar();
  useOwnsTitle(inShell);
  if (inShell) {
    if (title == null && !right) return null;
    return (
      <header className={`${styles.wide} ${className ?? ''}`}>
        {title != null ? <h1 className={styles.wideTitle}>{title}</h1> : <span />}
        {right && <div className={styles.wideActions}>{right}</div>}
      </header>
    );
  }
  return (
    <header
      className={`${styles.header} ${className ?? ''}`}
      data-sticky={sticky || undefined}
      data-center={center || undefined}
    >
      <div className={styles.slot}>{left}</div>
      {title != null && (
        <h1 className={styles.title} data-large={large || undefined}>
          {title}
        </h1>
      )}
      <div className={`${styles.slot} ${styles.slotRight}`}>{right}</div>
    </header>
  );
}
