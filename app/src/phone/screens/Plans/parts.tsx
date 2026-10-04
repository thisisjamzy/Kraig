'use client';

// Shared pieces of the Buckets, Priorities and Plans forecast screens: the
// card (title, status chip, then up to 3 visuals, each with its own
// caption, and a generated summary underneath), the status chip, and money formatting. Colours are
// the Dreda plan tokens on .page (Plans.module.css).

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, CircleDot } from 'lucide-react';
import styles from '@/src/phone/screens/Plans/Plans.module.css';

export type Tone = 'good' | 'watch' | 'bad' | 'neutral';

export function full(n: number, currency?: string) {
  const v = Math.round(n).toLocaleString('en-US');
  return currency ? `${v} ${currency}` : v;
}

/** Axis ticks only: 1.2M, 450k. */
export function compact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`;
  return `${sign}${Math.round(a)}`;
}

const ICON = { good: CircleCheck, watch: CircleDot, bad: CircleAlert, neutral: CircleDot };

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = ICON[tone];
  return (
    <span className={styles.chip} data-tone={tone}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {children}
    </span>
  );
}

export const STATUS_TEXT = { on_track: 'On track', watch: 'Watch', off_track: 'Off track' } as const;
export const STATUS_TONE: Record<keyof typeof STATUS_TEXT, Tone> = { on_track: 'good', watch: 'watch', off_track: 'bad' };

export function Card({
  id,
  title,
  chip,
  summary,
  action,
  children,
  navy,
}: {
  id?: string;
  title: string;
  chip?: ReactNode;
  summary?: ReactNode;
  action?: { label: string; href: string };
  children?: ReactNode;
  navy?: boolean;
}) {
  const card = (
    <section id={id} className={styles.card} data-navy={navy || undefined} aria-label={title}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {chip}
      </header>
      {children}
      {action && (
        <Link href={action.href} className={styles.cardAction}>
          {action.label}
          <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
        </Link>
      )}
    </section>
  );
  // The card keeps to figures and visuals; its description sits underneath.
  if (!summary) return card;
  return (
    <div className={styles.cardWrap}>
      {card}
      <p className={styles.note}>{summary}</p>
    </div>
  );
}

/** "Sep", or "Sep 27" when it isn't this year. */
export function monthShort(key: string, today: Date) {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
  return y === today.getFullYear() ? name : `${name} ${String(y).slice(2)}`;
}

/** A figure with its heading above; the number never wraps. */
export function Figure({ label, value, currency, tone }: { label: string; value: number; currency?: string; tone?: 'bad' }) {
  return (
    <div className={styles.figure} data-tone={tone}>
      <span>{label}</span>
      <strong>
        {full(value)}
        {currency && <small> {currency}</small>}
      </strong>
    </div>
  );
}

export function Visual({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <figure className={styles.visual}>
      {children}
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; color: string; style?: 'line' | 'outline' }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((i) => (
        <li key={i.label}>
          <span className={styles.swatch} data-style={i.style} style={{ '--c': i.color } as React.CSSProperties} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function TooltipBox({ active, title, rows }: { active?: boolean; title: string; rows: { label: string; value: string; color?: string }[] }) {
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

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  dark,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  dark?: boolean;
}) {
  return (
    <div className={styles.segmented} data-dark={dark || undefined} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const AXIS_TICK = { fill: 'var(--pl-muted)', fontSize: 11 };
export const COLORS = {
  blue: 'var(--pl-blue)',
  navy: 'var(--pl-navy)',
  light: 'var(--pl-light-blue)',
  red: 'var(--pl-red)',
  amber: 'var(--pl-amber)',
  grey: 'var(--pl-grey)',
};
