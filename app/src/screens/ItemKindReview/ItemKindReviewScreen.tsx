'use client';

// "Check your items" on tablet and web: the baskets migration's review
// list, one section per basket, each item's kind as a dropdown.

import { ListChecks } from 'lucide-react';
import { useLogic } from '@/src/logic/itemKindReview/useLogic';
import type { ItemKind } from '@/src/shared/budget/itemKinds';
import { ResponsivePage } from '@/src/widgets/Layout/ResponsivePage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from '@/src/screens/MigrationReport/MigrationReport.module.css';

export function ItemKindReviewScreen() {
  const v = useLogic();
  return (
    <ResponsivePage
      title="Check your items"
      kind="Each item now has a kind: Payment, Allowance or Set aside"
      icon={<ListChecks size={24} strokeWidth={2} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Budget', href: '/budget' }, { label: 'Check your items' }]}
      back="/budget"
    >
      <ScreenState loading={v.loading} />
      {!v.loading && v.count === 0 && <p className={styles.muted}>Nothing to check.</p>}
      {v.error && <p className={styles.muted}>{v.error}</p>}
      {v.byBasket.map((group) => (
        <section key={group.bucketId} className={styles.section}>
          <h2>
            {group.bucketName} <span>{group.entries.length}</span>
          </h2>
          <ul>
            {group.entries.map((entry) => (
              <li key={entry.itemId}>
                <strong>{entry.name}</strong>
                <span>{entry.why}</span>
                <select
                  value={v.kindOf(entry.bucketId, entry.itemId, entry.kind)}
                  onChange={(e) => void v.choose(entry.bucketId, entry.itemId, e.target.value as ItemKind)}
                  aria-label={`Kind of ${entry.name}`}
                >
                  {v.kindOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!v.loading && !v.reviewed && (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={v.busy} onClick={() => void v.done()}>
            Done
          </button>
        </div>
      )}
    </ResponsivePage>
  );
}
