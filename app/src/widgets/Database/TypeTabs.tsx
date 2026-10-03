'use client';

// The type tabs (Income, Expenses, Savings, Transfers) — the only tab level
// a page ever has. Icon, label and count; on phones a horizontally
// scrolling row (icons hidden under 360px) with the active tab kept in
// view and a 2px underline.

import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './TypeTabs.module.css';

export interface TypeTab<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  count: number;
}

export function TypeTabs<K extends string>({ tabs, value, onChange, label }: { tabs: TypeTab<K>[]; value: K; onChange: (key: K) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div ref={ref} className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === value} className={styles.tab} onClick={() => onChange(t.key)}>
            <Icon size={16} strokeWidth={2} aria-hidden className={styles.icon} />
            <span>{t.label}</span>
            <span className={styles.count}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
