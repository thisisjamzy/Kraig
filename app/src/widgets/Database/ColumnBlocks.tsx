// Notion's column blocks: a page's content side by side, each column a
// stack of blocks. `template` is the grid's columns ("300px 1fr 380px");
// below the page's breakpoint the caller passes one column instead.

import type { CSSProperties, ReactNode } from 'react';
import styles from './NotionPage.module.css';

export function ColumnBlocks({ template, children, label }: { template: string; children: ReactNode; label?: string }) {
  return (
    <div className={styles.columns} style={{ '--cols': template } as CSSProperties} aria-label={label}>
      {children}
    </div>
  );
}

export function Column({ children, sticky = false, label }: { children: ReactNode; sticky?: boolean; label?: string }) {
  return (
    <div className={styles.column} data-sticky={sticky || undefined} aria-label={label} role={label ? 'region' : undefined}>
      {children}
    </div>
  );
}
