'use client';

// A basket's "All time" view (src/logic/planningBucket/basketPage.ts's
// basketAllTime), the same on phone and web: what has been paid against it
// since the first payment, then every item it holds, whatever its months,
// with how it repeats, its amount, what was paid, the last payment, the
// next date and whether it's still open. Each row opens the item.

import Link from 'next/link';
import type { AllTimeView } from '@/src/logic/planningBucket/basketPage';
import s from './BasketAllTime.module.css';

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function BasketAllTime({ view, bucketId, currency, loading, paidWord = 'Paid' }: { view: AllTimeView | null; bucketId: string; currency: string; loading: boolean; paidWord?: string }) {
  if (!view || loading) return <p className={s.muted}>Loading every item…</p>;
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString('en-US')}`;
  return (
    <section className={s.root} aria-label="All time">
      <div className={s.summary}>
        <div>
          <span className={s.label}>{paidWord} all time</span>
          <b>{money(view.paid)}</b>
          <span className={s.muted}>
            {view.payments} payment{view.payments === 1 ? '' : 's'}
            {view.firstPaid ? ` since ${day(view.firstPaid)}` : ''}
          </span>
        </div>
        <div>
          <span className={s.label}>Items</span>
          <b>{view.items.length}</b>
          <span className={s.muted}>{view.open} still open</span>
        </div>
      </div>
      {view.items.length ? (
        <ul className={s.list}>
          {view.items.map((i) => (
            <li key={i.id}>
              <Link className={s.row} href={`/budget/item/${bucketId}/${i.id}?month=${monthOf(i.next ?? i.lastPaid ?? new Date())}`}>
                <span className={s.name}>
                  {i.name}
                  <small>
                    {i.schedule} · {money(i.amount)}
                    {i.next ? ` · next ${day(i.next)}` : ''}
                  </small>
                </span>
                <span className={s.figures}>
                  <b>{money(i.paid)}</b>
                  <small>{i.lastPaid ? `last ${day(i.lastPaid)}` : 'nothing yet'}</small>
                </span>
                <span className={s.status} data-status={i.status}>
                  {i.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.muted}>This basket has no items yet.</p>
      )}
    </section>
  );
}
