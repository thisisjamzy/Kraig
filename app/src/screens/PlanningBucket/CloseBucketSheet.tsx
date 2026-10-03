'use client';

// Closing a bucket for the month: what happens to its money, and an
// optional note on how it went. Closing marks its items done (no more
// payments expected); any leftover can then be moved elsewhere, and an
// overspend still needs covering.

import { useState } from 'react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { money } from '@/src/viewmodels/planning';
import p from '@/src/screens/Planning/Planning.module.css';
import styles from './Adjustments.module.css';

export function CloseBucketSheet({
  month,
  currency,
  leftover,
  over,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  month: string;
  currency: string;
  leftover: number;
  over: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal title={`Close this bucket for ${month}?`} onClose={onClose}>
      <div className={styles.form}>
        <p className={styles.hint}>
          {over > 0
            ? `It's ${money(over)} ${currency} over plan overall. Closing doesn't cover that, you can still cover or justify it.`
            : leftover > 0
              ? `${money(leftover)} ${currency} is left over. Once it's closed you can move it to another bucket, savings or next month.`
              : 'It came out exactly on plan.'}{' '}
          Its remaining payments will no longer show as due. You can reopen it any time.
        </p>
        <label className={styles.field}>
          How did it go? (optional)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hotel cost more, but transport came in under." />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={p.textButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={p.fillButton} disabled={busy} onClick={() => onConfirm(note)}>
            {busy ? 'Closing…' : 'Close bucket'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
