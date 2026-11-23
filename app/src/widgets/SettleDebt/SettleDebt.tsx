'use client';

// Forgive or cancel a debt (owner, 23 Nov 2026). "Forgive debt" for money
// owed to you; "Cancel debt" for money you owe that the other party wrote
// off. A confirm sheet with the remaining amount, an optional note and the
// date. No wallet moves and nothing appears in Transactions. Reopen
// reverses it.

import { useState } from 'react';
import { reopenDebt, settleDebt } from '@/src/shared/firestore/debtWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreDebt } from '@/src/shared/firestore/types';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './SettleDebt.module.css';

const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function useSettleDebt(debt: Pick<FirestoreDebt, 'id' | 'direction' | 'status' | 'currentBalance'> | null) {
  const { user } = useFirebaseUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind: 'forgiven' | 'cancelled' = debt?.direction === 'owed' ? 'forgiven' : 'cancelled';
  const settled = debt?.status === 'forgiven' || debt?.status === 'cancelled';
  async function confirm(date: Date, note: string) {
    if (!user || !debt || busy) return;
    setBusy(true);
    setError(null);
    try {
      await settleDebt(user.uid, debt.id, { kind, date, note });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not settle this debt.');
    } finally {
      setBusy(false);
    }
  }
  async function reopen() {
    if (!user || !debt || busy) return;
    setBusy(true);
    try {
      await reopenDebt(user.uid, debt.id);
    } finally {
      setBusy(false);
    }
  }
  return {
    kind,
    settled,
    canSettle: Boolean(debt) && !settled && (debt?.currentBalance ?? 0) > 0,
    label: kind === 'forgiven' ? 'Forgive debt' : 'Cancel debt',
    open,
    start: () => {
      setError(null);
      setOpen(true);
    },
    close: () => setOpen(false),
    confirm,
    reopen,
    busy,
    error,
  };
}

export function SettleDebtSheet({ s, remaining, currency }: { s: ReturnType<typeof useSettleDebt>; remaining: number; currency: string }) {
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso);
  if (!s.open) return null;
  const amount = `${Math.round(remaining).toLocaleString('en-US')} ${currency}`;
  return (
    <Modal title={s.label} onClose={s.close}>
      <div className={styles.sheet}>
        <p className={styles.lead}>
          {s.kind === 'forgiven' ? `You let go of the ${amount} still owed to you.` : `The ${amount} you still owe was written off by the other side.`} No money
          moves and nothing is recorded as spending or income.
        </p>
        <div className={styles.figure}>
          <span>Remaining</span>
          <strong>{amount}</strong>
        </div>
        <label className={styles.field}>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Note (optional)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, or what was agreed" />
        </label>
        <p className={styles.warn}>This cannot be undone, except by reopening the debt.</p>
        {s.error && (
          <p className={styles.error} role="alert">
            {s.error}
          </p>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={s.busy || !date}
          onClick={() => {
            const [y, m, d] = date.split('-').map(Number);
            void s.confirm(new Date(y, m - 1, d, 12), note);
          }}
        >
          {s.busy ? 'Saving…' : s.kind === 'forgiven' ? `Forgive ${amount}` : `Cancel ${amount}`}
        </button>
      </div>
    </Modal>
  );
}

/** On a settled debt: what happened, and Reopen. */
export function SettledNote({ debt, s, currency }: { debt: Pick<FirestoreDebt, 'status' | 'settledEvent'>; s: ReturnType<typeof useSettleDebt>; currency: string }) {
  const e = debt.settledEvent;
  if (!s.settled || !e) return null;
  return (
    <div className={styles.note}>
      <span>
        <strong>{e.kind === 'forgiven' ? 'Forgiven' : 'Cancelled'}</strong> on {e.date.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}:{' '}
        {Math.round(e.amount).toLocaleString('en-US')} {currency} written off.{e.note ? ` ${e.note}` : ''}
      </span>
      <button type="button" className={styles.reopen} disabled={s.busy} onClick={() => void s.reopen()}>
        Reopen
      </button>
    </div>
  );
}
