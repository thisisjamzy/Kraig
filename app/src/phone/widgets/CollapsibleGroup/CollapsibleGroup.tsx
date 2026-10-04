'use client';

// A titled group of BASELINE list rows that folds open and closed: the
// title, how many rows and their total on the right, then the rows in one
// rounded card. Used by the phone Ready to pay and month review pages.
// Render it inside a Planning page (p.page), which defines the colors.

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/widgets/CollapsibleGroup/CollapsibleGroup.module.css';

export function CollapsibleGroup({
  title,
  count,
  total,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  total?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={styles.group}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.title}>
          {title} <span className={styles.count}>{count}</span>
        </span>
        {total && <span className={styles.total}>{total}</span>}
        <ChevronDown size={18} strokeWidth={2} className={styles.chevron} data-open={open || undefined} aria-hidden />
      </button>
      {open && <div className={p.rows}>{children}</div>}
    </section>
  );
}
