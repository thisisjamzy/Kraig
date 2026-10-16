'use client';

// The History list's selection bar, while selecting (the toolbar's Select
// icon, src/widgets/ListQuery's ListQueryTool, starts it): how many are
// selected, select all, Delete and Done; Delete asks first,
// inline (never a browser dialog), and the outcome stays until dismissed.

import type { HistoryRow } from '@/src/logic/planning/rows';
import { isSelectable, type RecordSelection } from '@/src/logic/planning/useRecordSelection';
import styles from './SelectionBar.module.css';

const plural = (n: number) => `${n} ${n === 1 ? 'transaction' : 'transactions'}`;

export function SelectionBar({ selection: s, rows }: { selection: RecordSelection; rows: HistoryRow[] }) {
  const selectable = rows.filter(isSelectable);
  const count = selectable.filter(s.isSelected).length;
  const all = selectable.length > 0 && count === selectable.length;

  if (!s.selecting && !s.result) return null;
  return (
    <div className={styles.wrap}>
      {s.result && (
        <div className={styles.result} role="status">
          <span>
            {s.result.deleted > 0 ? `Deleted ${plural(s.result.deleted)}.` : 'Nothing was deleted.'}
            {s.result.failed.length > 0 && ` ${s.result.failed.length} could not be deleted:`}
          </span>
          {s.result.failed.length > 0 && (
            <ul>
              {s.result.failed.map((f, i) => (
                <li key={i}>
                  <strong>{f.name}</strong> {f.reason}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.quiet} onClick={s.dismissResult}>
            OK
          </button>
        </div>
      )}

      {!s.selecting ? null : s.confirmOpen ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Delete the selected transactions">
          <p>
            Delete {plural(count)}? Each amount is taken back off its wallet and this month’s figures. This can’t be undone.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.quiet} onClick={s.cancelDelete} disabled={s.deleting}>
              Cancel
            </button>
            <button type="button" className={styles.danger} onClick={() => s.deleteSelected(rows)} disabled={s.deleting}>
              {s.deleting ? `Deleting ${s.done} of ${count}…` : `Delete ${plural(count)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.bar}>
          <span className={styles.count}>{count} selected</span>
          <button type="button" className={styles.quiet} onClick={() => s.toggleAll(rows)}>
            {all ? 'Select none' : `Select all ${selectable.length}`}
          </button>
          <span className={styles.spacer} />
          <button type="button" className={styles.danger} onClick={s.askDelete} disabled={count === 0}>
            Delete
          </button>
          <button type="button" className={styles.quiet} onClick={s.stop}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/** A row's tick box while selecting. */
export function SelectBox({ checked }: { checked: boolean }) {
  return <span className={styles.box} data-checked={checked || undefined} aria-hidden />;
}
