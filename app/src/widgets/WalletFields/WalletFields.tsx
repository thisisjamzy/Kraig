'use client';

// Wallet form parts (owner, 23 Nov 2026), shared by Create wallet and Edit
// wallet on web and phone: the Colour row (nine label hues as a radio
// group) and the Fees section (bands of amounts, each with a fee).

import { useRef, type KeyboardEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { FeeKind, WalletHue } from '@/src/shared/firestore/types';
import cf from '@/src/widgets/CardForm/CardForm.module.css';
import styles from './WalletFields.module.css';

const HUE_NAME: Record<WalletHue, string> = {
  purple: 'Purple',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  lime: 'Lime',
  amber: 'Amber',
  orange: 'Orange',
  rose: 'Rose',
  grey: 'Grey',
};

/** "Colour": nine 32px swatches, the chosen one checked and ringed. Arrow
 *  keys move the choice, as a radio group does. */
export function WalletColorField({
  hues,
  value,
  onChange,
  className,
  labelClassName,
}: {
  hues: readonly WalletHue[];
  value: WalletHue;
  onChange: (hue: WalletHue) => void;
  /** The field's own frame; the form-card look when left out. */
  className?: string;
  labelClassName?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + hues.length) % hues.length;
    onChange(hues[next]);
    refs.current[next]?.focus();
  }
  return (
    <div className={className ?? cf.card}>
      <span className={labelClassName ?? cf.label} id="wallet-colour-label">
        Colour
      </span>
      <div className={styles.swatches} role="radiogroup" aria-labelledby="wallet-colour-label">
        {hues.map((hue, i) => {
          const on = hue === value;
          return (
            <button
              key={hue}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={HUE_NAME[hue]}
              title={HUE_NAME[hue]}
              tabIndex={on ? 0 : -1}
              className={styles.swatch}
              style={{ background: `var(--label-${hue}-solid)` }}
              onClick={() => onChange(hue)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {on && <Check size={16} strokeWidth={3} aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface FeeRowInput {
  min: string;
  max: string;
  fee: string;
  kind: 'fixed' | 'percent';
}

const KIND_LABEL: Record<FeeKind, string> = { transfer: 'Transfers', withdrawal: 'Withdrawals', payment: 'Payments' };

/** "Fees": the bands table, which moves it applies to, the problem with the
 *  bands in words, and when the schedule last changed. */
export function WalletFeesField({
  on,
  onToggle,
  rows,
  onAdd,
  onChange,
  onRemove,
  appliesTo,
  onToggleKind,
  problem,
  updatedAt,
  currency,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  rows: FeeRowInput[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<FeeRowInput>) => void;
  onRemove: (index: number) => void;
  appliesTo: FeeKind[];
  onToggleKind: (kind: FeeKind) => void;
  problem: string | null;
  updatedAt: Date | null;
  currency: string;
}) {
  const digits = (v: string) => v.replace(/[^0-9.]/g, '');
  return (
    <div className={`${cf.card} ${styles.fees}`}>
      <label className={styles.toggleRow}>
        <span>
          <span className={styles.toggleLabel}>This wallet charges fees</span>
          <span className={styles.hint}>Keep the operator&apos;s fee bands here and Dreda fills in the fee when you move money out.</span>
        </span>
        <input type="checkbox" role="switch" className={styles.switch} checked={on} onChange={(e) => onToggle(e.target.checked)} />
      </label>
      {on && (
        <>
          <div className={styles.kinds} role="group" aria-label="Charged on">
            {(['transfer', 'withdrawal', 'payment'] as FeeKind[]).map((k) => (
              <button key={k} type="button" className={styles.kind} aria-pressed={appliesTo.includes(k)} onClick={() => onToggleKind(k)}>
                {appliesTo.includes(k) && <Check size={14} strokeWidth={2.5} aria-hidden />}
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className={styles.table} role="table" aria-label="Fee bands">
            <div className={styles.head} role="row">
              <span role="columnheader">From</span>
              <span role="columnheader">To</span>
              <span role="columnheader">Fee</span>
              <span role="columnheader" className={styles.srOnly}>
                Fixed or percent
              </span>
              <span role="columnheader" className={styles.srOnly}>
                Delete
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className={styles.row} role="row">
                <input className={styles.cell} inputMode="decimal" aria-label={`Row ${i + 1} from`} value={r.min} onChange={(e) => onChange(i, { min: digits(e.target.value) })} placeholder="0" />
                <input className={styles.cell} inputMode="decimal" aria-label={`Row ${i + 1} to`} value={r.max} onChange={(e) => onChange(i, { max: digits(e.target.value) })} placeholder="and above" />
                <input className={styles.cell} inputMode="decimal" aria-label={`Row ${i + 1} fee`} value={r.fee} onChange={(e) => onChange(i, { fee: digits(e.target.value) })} placeholder="0" />
                <div className={styles.unit} role="group" aria-label={`Row ${i + 1} fee type`}>
                  <button type="button" aria-pressed={r.kind === 'fixed'} onClick={() => onChange(i, { kind: 'fixed' })} title={`A fixed fee in ${currency}`}>
                    {currency}
                  </button>
                  <button type="button" aria-pressed={r.kind === 'percent'} onClick={() => onChange(i, { kind: 'percent' })} title="A percentage of the amount">
                    %
                  </button>
                </div>
                <button type="button" className={styles.remove} aria-label={`Delete row ${i + 1}`} disabled={rows.length === 1} onClick={() => onRemove(i)}>
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={styles.add} onClick={onAdd}>
            <Plus size={16} strokeWidth={2.25} aria-hidden />
            Add band
          </button>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <p className={styles.hint}>
            {updatedAt
              ? `Schedule last changed on ${updatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : 'From includes the amount; To does not. Leave the last To blank for "and above".'}
          </p>
        </>
      )}
    </div>
  );
}
