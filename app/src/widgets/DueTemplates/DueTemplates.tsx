'use client';

// "Due today" on Payments: repeating templates whose day it is. Record
// opens the filled-in Add transaction form; Skip records nothing.

import { useDueTemplates } from '@/src/logic/templatesDue/useLogic';
import styles from './DueTemplates.module.css';

export function DueTemplates() {
  const { due, skip, busy } = useDueTemplates();
  if (!due.length) return null;
  return (
    <section className={styles.card} aria-label="Templates due today">
      <h2 className={styles.title}>
        Due today <span>{due.length}</span>
      </h2>
      {due.map(({ template: t, repeat, recordHref }) => (
        <div key={t.id} className={styles.row}>
          <span className={styles.text}>
            <strong>{t.name}</strong>
            <span>{[repeat, t.amount != null ? Math.round(t.amount).toLocaleString('en-US') : 'Amount to fill in'].join(' · ')}</span>
          </span>
          <span className={styles.actions}>
            <button type="button" className={styles.skip} disabled={busy === t.id} onClick={() => void skip(t.id)}>
              Skip
            </button>
            {/* A full load: Add transaction reads the template once, on mount. */}
            <a href={recordHref} className={styles.record}>
              Record
            </a>
          </span>
        </div>
      ))}
    </section>
  );
}
