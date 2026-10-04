'use client';

// Small shared pieces of the Planning screens (Planning.module.css).

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Check, PiggyBank, Repeat, ShoppingBag, Sparkles, Tag } from 'lucide-react';
import { fillOf, money, type Prompt, dayMonth } from '@/src/viewmodels/planning';
import type { HistoryRow } from '@/src/logic/planning/rows';
import styles from '@/src/phone/screens/Planning/Planning.module.css';

/** "24,000 / 54,000" — spent bold, planned light. */
export function Pair({ spent, planned, currency }: { spent: number; planned: number; currency?: string }) {
  return (
    <span className={styles.pair}>
      <strong>{money(spent)}</strong>
      <span>
        {' '}
        / {money(planned)}
        {currency ? ` ${currency}` : ''}
      </span>
    </span>
  );
}

export function Bar({ spent, planned, over }: { spent: number; planned: number; over?: boolean }) {
  return (
    <div className={styles.bar} role="presentation">
      <div className={styles.barFill} data-tone={over ? 'over' : undefined} style={{ width: `${fillOf(spent, planned) * 100}%` }} />
    </div>
  );
}

const TYPE_ICON = { Expense: ShoppingBag, Income: ArrowDownLeft, Savings: PiggyBank, Transfer: ArrowLeftRight } as const;

export function IconCircle({ type, category }: { type?: string; category?: boolean }) {
  const Icon = category ? Tag : (TYPE_ICON[(type ?? 'Expense') as keyof typeof TYPE_ICON] ?? ShoppingBag);
  return (
    <span className={styles.iconCircle} aria-hidden>
      <Icon size={17} strokeWidth={2} />
    </span>
  );
}

/** Where a bucket's (or one item's) action flows live. */
export function coverHref(month: string, bucketId: string, itemId?: string) {
  return `/budget/cover?month=${month}&bucket=${bucketId}${itemId ? `&item=${itemId}` : ''}`;
}
export function reallocateHref(month: string, bucketId: string, itemId?: string) {
  return `/budget/reallocate?month=${month}&bucket=${bucketId}${itemId ? `&item=${itemId}` : ''}`;
}

/** The slim strip on a card's bottom edge — only when action is needed. */
export function PromptStrip({
  prompt,
  currency,
  month,
  bucketId,
}: {
  prompt: Prompt;
  currency: string;
  month: string;
  bucketId: string;
}) {
  if (prompt.kind === 'justified') {
    return (
      <div className={styles.stripJustified}>
        <span className={styles.tag}>
          <Check size={11} strokeWidth={3} aria-hidden />
          justified · {prompt.reason}
        </span>
      </div>
    );
  }
  if (prompt.kind === 'uncovered') {
    // Settled, but part was left "not covered yet" — a smaller red strip.
    return (
      <div className={styles.strip} data-tone="over" data-size="small">
        <span className={styles.stripText}>
          {money(prompt.amount)} {currency} still uncovered
        </span>
        <Link href={coverHref(month, bucketId)} className={styles.stripAction} onClick={(e) => e.stopPropagation()}>
          Resolve
          <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    );
  }
  const over = prompt.kind === 'over';
  return (
    <div className={styles.strip} data-tone={over ? 'over' : 'leftover'}>
      <span className={styles.stripText}>
        {over ? <AlertCircle size={14} strokeWidth={2.5} aria-hidden /> : <Sparkles size={14} strokeWidth={2.5} aria-hidden />}
        {over ? `Over by ${money(prompt.amount)} ${currency}` : `${money(prompt.amount)} ${currency} left over`}
      </span>
      <Link
        href={over ? coverHref(month, bucketId) : reallocateHref(month, bucketId)}
        className={styles.stripAction}
        onClick={(e) => e.stopPropagation()}
      >
        {over ? 'Cover or justify' : 'Reallocate'}
        <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
      </Link>
    </div>
  );
}

function when(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function HistoryRowView({ row, currency, showDate = false }: { row: HistoryRow; currency: string; showDate?: boolean }) {
  const Icon = row.flow === 'in' ? ArrowDownLeft : row.flow === 'out' ? ArrowUpRight : row.flow === 'adjust' ? Repeat : ArrowLeftRight;
  const sign = row.kind !== 'transaction' ? '' : row.amount > 0 ? '+' : '-';
  return (
    <Link href={row.href} className={styles.row}>
      <span className={styles.rowIcon} data-flow={row.flow} aria-hidden>
        <Icon size={17} strokeWidth={2.25} />
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowName}>{row.name}</span>
        {row.note && row.note !== row.name && <span className={styles.rowNote}>{row.note}</span>}
        {row.method && <span className={styles.rowMethod}>{row.method}</span>}
        {row.assignable && (
          <span className={styles.rowAssign}>
            Assign to bucket
            <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
          </span>
        )}
      </span>
      <span className={styles.rowSide}>
        <span className={styles.rowAmount} data-flow={row.flow}>
          {sign}
          {money(Math.abs(row.amount))} {currency}
        </span>
        <span className={styles.rowWhen}>
          {showDate ? dayMonth(row.date) : row.timeKnown === false ? '' : when(row.date)}
        </span>
        {row.bucketName && <span className={styles.chip}>{row.bucketName}</span>}
      </span>
    </Link>
  );
}

export function SpecRow({ children }: { children: ReactNode }) {
  return <div className={styles.specRow}>{children}</div>;
}

export function SpecCell({ label, value, tone }: { label: string; value: ReactNode; tone?: 'over' | 'good' }) {
  return (
    <div className={styles.specCell}>
      <span className={styles.specLabel}>{label}</span>
      <span className={styles.specValue} data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

export { styles as planningStyles };
