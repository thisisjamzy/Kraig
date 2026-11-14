'use client';

// The top of Budget on tablet and web (Dreda.figcraft `Budget / Web`):
//   - Planned for <month>: what is planned against income expected, the
//     amount left to plan, a stacked bar and its legend by flow type;
//   - Available now: the purple card with money received and not yet used,
//     what waits for income, what is still to pay and Unaccounted for;
//   - Needs your attention: one row per thing worth doing, each with the
//     button that does it.
// All figures come from the budget month (logic/budgetMonth).

import Link from 'next/link';
import { BadgeCheck, ClipboardCheck, Info, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { MonthTotals } from '@/src/shared/budget/monthTotals';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { UNJUSTIFIED_WALLET_ID } from '@/src/shared/firestore/refs';
import styles from './PlanCards.module.css';
import { maskAmount } from '@/src/shared/hooks/usePrivacy';

const money = (n: number) => maskAmount(Math.round(n).toLocaleString('en-US'));

export function PlanCards({
  monthName,
  totals,
  canPayNow,
  waiting,
  unaccounted,
}: {
  monthName: string;
  totals: MonthTotals;
  canPayNow: number;
  waiting: number;
  unaccounted: number;
}) {
  const planned = totals.expenses.planned + totals.savings.planned + totals.transfers.planned;
  const expected = totals.income.expected;
  const scale = Math.max(expected, planned, 1);
  const parts = [
    { key: 'expense', label: 'Expenses', value: totals.expenses.planned },
    { key: 'savings', label: 'Savings', value: totals.savings.planned },
    { key: 'transfer', label: 'Transfers', value: totals.transfers.planned },
    { key: 'left', label: totals.leftToPlan < 0 ? 'Over plan' : 'Left to plan', value: Math.abs(totals.leftToPlan) },
  ];
  const stillToPay = totals.expenses.left + totals.savings.left + totals.transfers.left;
  return (
    <div className={styles.top}>
      <section className={styles.planned} aria-label={`Planned for ${monthName}`}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Planned for {monthName}</h2>
            <p className={styles.sub}>
              {money(planned)} planned of {money(expected)} income expected
            </p>
          </div>
          <Link href="/baskets" className={styles.link}>
            Edit plan
          </Link>
        </div>
        <p className={styles.big}>
          <strong data-bad={totals.leftToPlan < 0 || undefined}>{money(Math.abs(totals.leftToPlan))}</strong>
          <span>{totals.leftToPlan < 0 ? 'planned beyond the income expected' : 'left to plan from income expected'}</span>
        </p>
        <div className={styles.stack} aria-hidden>
          {parts.map((p) =>
            p.value > 0.5 ? <span key={p.key} data-part={p.key} data-bad={(p.key === 'left' && totals.leftToPlan < 0) || undefined} style={{ flexGrow: p.value / scale }} /> : null
          )}
        </div>
        <ul className={styles.legend}>
          {parts.map((p) => (
            <li key={p.key} data-part={p.key} data-bad={(p.key === 'left' && totals.leftToPlan < 0) || undefined}>
              <span>{p.label}</span>
              <strong>{money(p.value)}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.available} aria-label="Available now">
        <span className={styles.decor} aria-hidden />
        <p className={styles.overline}>Available now</p>
        <p className={styles.availableValue}>{money(totals.availableNow)}</p>
        <dl className={styles.rows}>
          <div>
            <dt>Can pay now</dt>
            <dd>{money(canPayNow)}</dd>
          </div>
          <div>
            <dt>Waiting for income</dt>
            <dd>{money(waiting)}</dd>
          </div>
          <div>
            <dt>Still to pay this month</dt>
            <dd>{money(Math.max(0, stillToPay))}</dd>
          </div>
        </dl>
        {Math.abs(unaccounted) >= 0.5 && (
          <Link href={`/wallets/${UNJUSTIFIED_WALLET_ID}`} className={styles.unaccounted}>
            <span>
              Unaccounted for <strong>{money(unaccounted)}</strong>
            </span>
            <em>Reconcile</em>
          </Link>
        )}
      </section>
    </div>
  );
}

export interface AttentionItem {
  key: string;
  icon: LucideIcon;
  tone: 'bad' | 'good' | 'watch' | 'info';
  title: string;
  text: string;
  action: { label: string; href: string };
}

/** What is worth doing on this month, most pressing first. */
export function attentionItems({
  month,
  monthName,
  expenses,
  readyCount,
  readyTotal,
  reviewed,
  past,
}: {
  month: string;
  monthName: string;
  expenses: LineRow[];
  readyCount: number;
  readyTotal: number;
  reviewed: boolean;
  past: boolean;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const over = expenses.filter((r) => !r.closed && r.actual > r.available + 0.5).sort((a, b) => b.actual - b.available - (a.actual - a.available));
  if (over[0]) {
    const r = over[0];
    items.push({
      key: 'over',
      icon: TrendingDown,
      tone: 'bad',
      title: `${r.name} is over by ${money(r.actual - r.available)}`,
      text: over.length > 1 ? `${over.length - 1} more over plan. Cover it from another basket or say why it happened.` : 'Cover it from another basket or say why it happened.',
      action: { label: 'Cover or justify', href: `/budget/cover?month=${month}&bucket=${r.bucketId}&item=${r.itemId}` },
    });
  }
  if (readyCount > 0) {
    items.push({
      key: 'ready',
      icon: BadgeCheck,
      tone: 'info',
      title: `${readyCount} ${readyCount === 1 ? 'payment is' : 'payments are'} ready to pay`,
      text: `Money received so far covers ${money(readyTotal)} of planned payments. Confirm them in one go.`,
      action: { label: 'Review payments', href: '/budget/ready' },
    });
  }
  const spare = expenses.filter((r) => !r.closed && r.available - r.actual > 0.5 && r.available > 0).sort((a, b) => b.available - b.actual - (a.available - a.actual));
  if (past && spare[0]) {
    const r = spare[0];
    items.push({
      key: 'left',
      icon: TrendingUp,
      tone: 'good',
      title: `${r.name} has ${money(r.available - r.actual)} left`,
      text: 'Move it to savings, another basket or next month when you close the basket.',
      action: { label: 'Reallocate', href: `/budget/reallocate?month=${month}&bucket=${r.bucketId}` },
    });
  }
  if (!reviewed && past) {
    items.push({
      key: 'review',
      icon: ClipboardCheck,
      tone: 'watch',
      title: `${monthName} is not reviewed yet`,
      text: 'Look back on the month: what went to plan, what did not, and what to change next time.',
      action: { label: 'Review', href: `/budget/review?month=${month}` },
    });
  }
  return items;
}

export function AttentionCard({ items, extra }: { items: AttentionItem[]; extra?: React.ReactNode }) {
  if (!items.length && !extra) return null;
  return (
    <section className={styles.attention} aria-label="Needs your attention">
      <h2 className={styles.attentionTitle}>
        Needs your attention {items.length > 0 && <span className={styles.count}>{items.length}</span>}
      </h2>
      <ul className={styles.attentionList}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.key}>
              <span className={styles.attentionIcon} data-tone={it.tone} aria-hidden>
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className={styles.attentionText}>
                <strong>{it.title}</strong>
                <span>{it.text}</span>
              </span>
              <Link href={it.action.href} className={styles.attentionAction}>
                {it.action.label}
              </Link>
            </li>
          );
        })}
        {extra && (
          <li>
            <span className={styles.attentionIcon} data-tone="info" aria-hidden>
              <Info size={18} strokeWidth={2} />
            </span>
            <span className={styles.attentionText}>{extra}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
