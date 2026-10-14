'use client';

// The window a check or audit covers: a row of presets (This month, Last
// month, ...) and, for "Custom dates", a from and to date
// (src/shared/budget/walletWindow.ts turns them into the window).

import type { WindowPreset } from '@/src/shared/budget/walletWindow';
import styles from './WindowPicker.module.css';

export function WindowPicker({
  label,
  presets,
  preset,
  onPreset,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  presets: { value: WindowPreset; label: string }[];
  preset: WindowPreset;
  onPreset: (preset: WindowPreset) => void;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <div className={styles.picker}>
      <span className={styles.label}>{label}</span>
      <div className={styles.presets} role="radiogroup" aria-label={label}>
        {presets.map((p) => (
          <button key={p.value} type="button" role="radio" aria-checked={preset === p.value} className={styles.preset} onClick={() => onPreset(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className={styles.dates}>
          <label>
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
