'use client';

// "Change date" for a planned payment (owner, 23 Nov 2026), from Payments:
// the date, then the scope, "Just this month" (the default) or "This and
// future months" for a payment that repeats.

import { useState } from 'react';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './ChangeDateSheet.module.css';

export type ChangeScope = 'month' | 'future';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function ChangeDateSheet({
  name,
  due,
  recurring,
  busy,
  error,
  onClose,
  onSave,
}: {
  name: string;
  due: Date;
  recurring: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (to: Date, scope: ChangeScope) => void;
}) {
  const [value, setValue] = useState(isoOf(due));
  const [scope, setScope] = useState<ChangeScope>('month');
  const [y, m, d] = value.split('-').map(Number);
  const to = value ? new Date(y, m - 1, d) : null;
  const same = to ? isoOf(to) === isoOf(due) : true;
  return (
    <Modal title="Change date" onClose={onClose}>
      <div className={styles.sheet}>
        <p className={styles.lead}>
          {name}, planned for {due.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
        </p>
        <label className={styles.field}>
          <span>New date</span>
          <input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        {recurring && (
          <fieldset className={styles.scope}>
            <legend>Which months?</legend>
            <label>
              <input type="radio" name="change-date-scope" checked={scope === 'month'} onChange={() => setScope('month')} />
              <span>
                <strong>Just this month</strong>
                <em>Only this payment moves.</em>
              </span>
            </label>
            <label>
              <input type="radio" name="change-date-scope" checked={scope === 'future'} onChange={() => setScope('future')} />
              <span>
                <strong>This and future months</strong>
                <em>The payment&apos;s planned day changes from now on.</em>
              </span>
            </label>
          </fieldset>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="button" className={styles.primary} disabled={!to || same || busy} onClick={() => to && onSave(to, recurring ? scope : 'month')}>
          {busy ? 'Saving…' : 'Move payment'}
        </button>
      </div>
    </Modal>
  );
}

/** "Moved from 5 Dec", or null. */
export function movedFromText(movedFrom: Date | null): string | null {
  return movedFrom ? `Moved from ${movedFrom.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : null;
}
