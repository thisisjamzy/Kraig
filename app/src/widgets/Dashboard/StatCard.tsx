'use client';

// Time v1.0's stat card (Dreda v1.0 `Stat card` 57436): the label with its
// icon in a round tile, the figure in Bricolage, then a small tinted chip
// and a caption, and a chevron when it opens somewhere. `StatCards` lays
// four in a row (two on medium screens).

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { hueVars, type LabelHue } from '@/src/viewmodels/projects';
import styles from './StatCard.module.css';

export interface Stat {
  label: string;
  icon: ReactNode;
  value: string;
  chip?: { text: string; hue: LabelHue } | null;
  caption?: string;
  href?: string;
}

export function StatCard({ stat }: { stat: Stat }) {
  const v = stat.chip ? hueVars(stat.chip.hue) : null;
  const body = (
    <>
      <span className={styles.head}>
        <span className={styles.label}>{stat.label}</span>
        <span className={styles.icon} aria-hidden>
          {stat.icon}
        </span>
      </span>
      <span className={styles.value}>{stat.value}</span>
      <span className={styles.foot}>
        {stat.chip && v && (
          <span className={styles.chip} style={{ background: v.bg, color: v.fg }}>
            {stat.chip.text}
          </span>
        )}
        {stat.caption && <span className={styles.caption}>{stat.caption}</span>}
        {stat.href && <ChevronRight size={18} strokeWidth={2} className={styles.chevron} aria-hidden />}
      </span>
    </>
  );
  return stat.href ? (
    <Link href={stat.href} className={styles.card}>
      {body}
    </Link>
  ) : (
    <section className={styles.card} aria-label={stat.label}>
      {body}
    </section>
  );
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className={styles.row}>
      {stats.map((s) => (
        <StatCard key={s.label} stat={s} />
      ))}
    </div>
  );
}
