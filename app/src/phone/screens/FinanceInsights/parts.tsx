'use client';

// Shared pieces of the finance Insights page: the section card (title,
// one-line takeaway, collapse / reorder, "see details"), change chips,
// money formatting (full amounts in cards and tooltips, compact on axes),
// the chart tooltip and legend, and empty states.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react';
import styles from '@/src/phone/screens/FinanceInsights/FinanceInsights.module.css';

export function full(n: number, currency?: string) {
  const v = Math.round(n).toLocaleString('en-US');
  return currency ? `${v} ${currency}` : v;
}

/** Axis ticks only: 1.2M, 450k. */
export function compact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`;
  return `${sign}${Math.round(a)}`;
}

export function percent(x: number | null, digits = 0) {
  return x === null ? '—' : `${(x * 100).toFixed(digits)}%`;
}

export const AXIS_TICK = { fill: 'var(--fi-muted)', fontSize: 11 };

export const COLORS = {
  income: 'var(--fi-blue)',
  expense: 'var(--fi-navy)',
  good: 'var(--fi-green)',
  bad: 'var(--fi-red)',
  amber: 'var(--fi-amber)',
  muted: 'var(--fi-light)',
};

/** A categorical palette for donuts / stacks (labels always shown too). */
export const PALETTE = ['#3b63f0', '#1c1f3a', '#2fa36b', '#d98a1c', '#8e5cf0', '#e0679c', '#a3a8b8'];

export function Section({
  id,
  title,
  takeaway,
  detailsHref,
  detailsLabel = 'See details',
  collapsed,
  onToggle,
  reordering,
  onMove,
  highlight,
  print,
  children,
}: {
  id: string;
  title: string;
  takeaway?: string;
  detailsHref?: string;
  detailsLabel?: string;
  collapsed: boolean;
  onToggle: () => void;
  reordering: boolean;
  onMove: (delta: -1 | 1) => void;
  /** A slightly stronger card (the unplanned spending section). */
  highlight?: boolean;
  /** Included in the printed "Share summary". */
  print?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.card} data-highlight={highlight || undefined} data-print={print ? 'keep' : 'hide'} aria-labelledby={`${id}-title`}>
      <header className={styles.cardHead}>
        <h2 id={`${id}-title`} className={styles.cardTitle}>
          {title}
        </h2>
        {reordering ? (
          <span className={styles.reorder}>
            <button type="button" onClick={() => onMove(-1)} aria-label={`Move ${title} up`}>
              <ChevronUp size={16} strokeWidth={2.5} />
            </button>
            <button type="button" onClick={() => onMove(1)} aria-label={`Move ${title} down`}>
              <ChevronDown size={16} strokeWidth={2.5} />
            </button>
          </span>
        ) : (
          <button type="button" className={styles.collapse} aria-expanded={!collapsed} onClick={onToggle} aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}>
            <ChevronDown size={18} strokeWidth={2.25} />
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          {takeaway && <p className={styles.takeaway}>{takeaway}</p>}
          {children}
          {detailsHref && (
            <Link href={detailsHref} className={styles.details}>
              {detailsLabel}
              <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
            </Link>
          )}
        </>
      )}
    </section>
  );
}

/** "▲ 12%" — green when better, red when worse; arrow + sign, never color alone. */
export function ChangeChip({ value, goodWhen, points }: { value: number | null; goodWhen: 'up' | 'down'; points?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className={styles.change}>— vs before</span>;
  if (Math.abs(value) < 0.005) return <span className={styles.change}>= same</span>;
  const up = value > 0;
  const good = (up && goodWhen === 'up') || (!up && goodWhen === 'down');
  const text = points ? `${Math.abs(value * 100).toFixed(1)} pts` : `${Math.abs(value * 100).toFixed(0)}%`;
  return (
    <span className={styles.change} data-tone={good ? 'good' : 'bad'}>
      {up ? <ArrowUp size={11} strokeWidth={3} aria-hidden /> : <ArrowDown size={11} strokeWidth={3} aria-hidden />}
      <span className={styles.srOnly}>{up ? 'up' : 'down'} </span>
      {text}
    </span>
  );
}

export function Empty({ children = 'Add a few transactions to see this.' }: { children?: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function Legend({ items }: { items: { label: string; color: string; style?: 'outline' | 'dashed' | 'line' }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={styles.swatch} data-style={item.style} style={{ '--c': item.color } as React.CSSProperties} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Recharts tooltip body: a title and full amounts, one row per series. */
export function TooltipBox({
  active,
  title,
  rows,
}: {
  active?: boolean;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  if (!active) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{title}</p>
      {rows.map((r) => (
        <p key={r.label} className={styles.tooltipRow}>
          {r.color && <span className={styles.tooltipDot} style={{ background: r.color }} aria-hidden />}
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </p>
      ))}
    </div>
  );
}

/** Index of the tapped bar/point from a Recharts chart click. */
export function tappedIndex(state: { activeIndex?: unknown; activeTooltipIndex?: unknown } | null): number | null {
  const raw = state?.activeIndex ?? state?.activeTooltipIndex;
  const n = Number(raw);
  return raw === undefined || raw === null || Number.isNaN(n) ? null : n;
}

export function Pills<T extends string>({
  value,
  options,
  onChange,
  label,
  small,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div className={styles.pills} data-small={small || undefined} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
