// The month being closed, in Month review: its own unaccounted figure and
// accountability rate (owner, 23 Nov 2026). Nothing carries into the new
// month; it opens at zero.

import Link from 'next/link';
import { rateText } from '@/src/viewmodels/accountability';
import styles from './ClosingMonth.module.css';

export function ClosingMonth({
  closing,
  money,
  currency,
}: {
  closing: { name: string; unaccounted: number; rate: number | null; checks: number } | null;
  money: (n: number) => string;
  currency: string;
}) {
  if (!closing || !closing.name) return null;
  return (
    <section className={styles.card} aria-label={`${closing.name} before it closes`}>
      <h2 className={styles.title}>{closing.name} before it closes</h2>
      <div className={styles.row}>
        <span>Unaccounted for in {closing.name}</span>
        <strong data-tone={closing.unaccounted >= 0.5 ? 'bad' : undefined}>
          {money(closing.unaccounted)} {currency}
        </strong>
      </div>
      <div className={styles.row}>
        <span>Spending you can account for</span>
        <strong>{rateText(closing.rate)}</strong>
      </div>
      <p className={styles.note}>
        {closing.checks === 0 ? `No balance check in ${closing.name}. ` : ''}
        This stays with {closing.name}; the new month starts at zero.{' '}
        <Link href="/settings/reconcile">Check your balances</Link>
      </p>
    </section>
  );
}
