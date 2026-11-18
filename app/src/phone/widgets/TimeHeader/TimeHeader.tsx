'use client';

// The header of Time's phone screens: the toolbar every page shares
// (GreetingHeader, owner 18 Nov 2026), then the page's title in Bricolage
// and a muted line under it (Dreda v1.0 `Today / Phone`, `Tasks / Phone`).

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { GreetingHeader } from '@/src/phone/widgets/GreetingHeader/GreetingHeader';
import styles from '@/src/phone/widgets/TimeHeader/TimeHeader.module.css';

/** The toolbar (GreetingHeader: your face, Hello and the date, the page's
 * buttons and More) stays on every Time page; the page's title sits under
 * it. `crumb`: a detail page's parent, a small back link over the title. */
export function TimeHeader({ title, sub, actions, crumb }: { title: string; sub?: ReactNode; actions?: ReactNode; crumb?: { label: string; href: string } }) {
  return (
    <header className={styles.header}>
      <GreetingHeader module="time" actions={actions} back={crumb?.href ?? '/projects/insights'} />
      <div className={styles.text}>
        {crumb && (
          <Link href={crumb.href} className={styles.crumb}>
            <ChevronLeft size={14} strokeWidth={2.25} aria-hidden />
            {crumb.label}
          </Link>
        )}
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
