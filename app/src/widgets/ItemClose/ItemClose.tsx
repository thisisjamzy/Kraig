'use client';

// "Close for <month>" on one item (owner, 23 Nov 2026), on the item panel
// on web and phone. Once a payment is recorded the button shows on the
// panel; the menu offers it at any time. Closed: the item reads Closed with
// what was spent against plan, and can be reopened in the same month. Over
// plan, it asks for the overspend to be covered or justified first.

import { Lock, LockOpen } from 'lucide-react';
import { money, monthTitle } from '@/src/viewmodels/planning';
import type { ItemMonth } from '@/src/shared/budget/monthBudget';
import styles from './ItemClose.module.css';

export interface ItemCloseLogic {
  month: string;
  closeForMonth: () => Promise<void>;
  reopenForMonth: () => Promise<void>;
  closing: boolean;
  overPlan: boolean;
  closedOnItsOwn: boolean;
}

/** The menu entries: Close for <month>, or Reopen <month>. */
export function itemCloseMenu(it: ItemCloseLogic, entry: ItemMonth) {
  if (entry.type === 'Income') return [];
  const month = monthTitle(it.month).split(' ')[0];
  if (it.closedOnItsOwn) return [{ key: 'reopen', label: `Reopen for ${month}`, icon: <LockOpen size={14} strokeWidth={2} />, onSelect: () => void it.reopenForMonth() }];
  if (entry.closed) return [];
  return [{ key: 'close', label: `Close for ${month}`, icon: <Lock size={14} strokeWidth={2} />, onSelect: () => void it.closeForMonth() }];
}

export function ItemCloseBar({ it, entry, currency }: { it: ItemCloseLogic; entry: ItemMonth; currency: string }) {
  if (entry.type === 'Income') return null;
  const month = monthTitle(it.month).split(' ')[0];
  if (it.closedOnItsOwn) {
    const diff = entry.available - entry.actual;
    return (
      <div className={styles.bar} data-closed>
        <span className={styles.text}>
          <strong>Closed for {month}</strong>
          <span>
            Spent {money(entry.actual)} of {money(entry.available)} {currency}
            {diff > 0.5 ? `, ${money(diff)} under plan went back to money left to plan.` : diff < -0.5 ? `, ${money(-diff)} over plan.` : ', on plan.'}
          </span>
        </span>
        <button type="button" className={styles.button} disabled={it.closing} onClick={() => void it.reopenForMonth()}>
          Reopen
        </button>
      </div>
    );
  }
  if (entry.closed || !(entry.actual > 0)) return null;
  return (
    <div className={styles.bar}>
      <span className={styles.text}>
        <strong>Paid {money(entry.actual)} this month</strong>
        <span>
          {it.overPlan
            ? 'Cover or justify the overspend before closing this item.'
            : `Done with it? Closing stops its reminders for ${month} and gives what is left back to money left to plan.`}
        </span>
      </span>
      <button type="button" className={styles.button} disabled={it.closing || it.overPlan} onClick={() => void it.closeForMonth()}>
        Close for {month}
      </button>
    </div>
  );
}
