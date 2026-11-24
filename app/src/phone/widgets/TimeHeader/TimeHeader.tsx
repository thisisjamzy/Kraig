'use client';

// The header of Time's phone screens: the toolbar every page shares
// (GreetingHeader, owner 18 Nov 2026), then the page's title in Bricolage
// and a muted line under it (Dreda v1.0 `Today / Phone`, `Tasks / Phone`).

import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '@/src/widgets/ActionMenu/ActionMenu';
import { GreetingHeader } from '@/src/phone/widgets/GreetingHeader/GreetingHeader';
import styles from '@/src/phone/widgets/TimeHeader/TimeHeader.module.css';

/** The toolbar (GreetingHeader: your face, Hello and the date, the page's
 * buttons and More) stays on every Time page; the page's title sits under
 * it. `crumb`: a detail page's parent, named over the title; the toolbar's
 * back arrow goes there (one back control per page, owner 23 Nov 2026). */
export function TimeHeader({ title, sub, actions, crumb }: { title: string; sub?: ReactNode; actions?: ReactNode; crumb?: { label: string; href: string } }) {
  return (
    <header className={styles.header}>
      <GreetingHeader module="time" actions={actions} back={crumb?.href ?? '/projects/insights'} />
      <div className={styles.text}>
        {crumb && <span className={styles.crumb}>{crumb.label}</span>}
        <h1 className={styles.title}>{title}</h1>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
    </header>
  );
}

/** A 44px round header button. */
export function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.round} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

/**
 * The header's More menu (owner, 24 Nov 2026): every page action that isn't
 * the page's one main job goes here, so the toolbar holds at most one
 * primary button and this.
 */
export function HeaderMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  return <ActionMenu ariaLabel={label} items={items} triggerClassName={styles.round} triggerIcon={<MoreVertical size={20} strokeWidth={2} />} />;
}
