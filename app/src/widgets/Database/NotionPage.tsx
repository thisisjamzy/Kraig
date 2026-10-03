'use client';

// The anatomy every wide-screen Notion-style page shares: a large title
// (about 40px, bold) with an optional icon and a muted kind label, the
// page's primary actions on the right of the title (never a floating
// bottom bar), then the properties block and content blocks at the full
// width of the content area. Navigation is the top bar's breadcrumb
// (useBreadcrumb), so the page has no header or back arrow of its own.

import type { ReactNode } from 'react';
import styles from './Database.module.css';

export function NotionPageHeader({
  icon,
  title,
  kind,
  actions,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** "Expense bucket" */
  kind?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageTitleRow}>
        <div className={styles.pageTitleWrap}>
          {icon && <span className={styles.pageIcon}>{icon}</span>}
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {kind && <p className={styles.pageKind}>{kind}</p>}
          </div>
        </div>
        {actions && <div className={styles.pageActions}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A titled content block (Items, Transactions, Notes). */
export function Block({ title, actions, children, id }: { title?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={styles.block} id={id} aria-label={title}>
      {(title || actions) && (
        <div className={styles.blockHead}>
          {title && <h2 className={styles.blockTitle}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
