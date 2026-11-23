'use client';

// TimePicker (owner, 23 Nov 2026): the app's one time input, opened from a
// Time row that matches the Date row beside it. A bottom sheet on a phone,
// a dialog on web, like the date picker. Quick picks (Now, 08:00, 12:00,
// 18:00, 21:00), then two wheel columns, hours and minutes, 24-hour and
// one-minute steps, that snap on a phone and scroll with a mouse or
// trackpad on web, where a text field also takes 14:30, 1430, 2:30 pm or
// 9h30. Arrow keys move the hour and minute, Enter confirms, Escape closes.
//
// `value` is minutes after midnight, or null for "Now" (the time Save is
// pressed: viewmodels/transactionTime.ts).
//
// Time mode keeps its own pickers for now (timepicker-ui, CardForm/TimeWheel,
// WindowPicker); they can move here later.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { hhmm, parseTimeText } from '@/src/viewmodels/transactionTime';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './TimePicker.module.css';

const QUICK: { label: string; value: number | null }[] = [
  { label: 'Now', value: null },
  { label: '08:00', value: 8 * 60 },
  { label: '12:00', value: 12 * 60 },
  { label: '18:00', value: 18 * 60 },
  { label: '21:00', value: 21 * 60 },
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ROW = 44;

const pad = (n: number) => String(n).padStart(2, '0');

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** One scrolling column of numbers that snaps to the middle row. */
function Wheel({ label, values, value, onChange }: { label: string; values: number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | null>(null);
  // Keep the chosen value in the middle when it changes from outside.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = values.indexOf(value) * ROW;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTo({ top: target });
  }, [value, values]);
  function onScroll() {
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW)));
      if (values[i] !== value) onChange(values[i]);
    }, 90);
  }
  function onKey(e: KeyboardEvent) {
    const i = values.indexOf(value);
    if (e.key === 'ArrowDown') onChange(values[(i + 1) % values.length]);
    else if (e.key === 'ArrowUp') onChange(values[(i - 1 + values.length) % values.length]);
    else return;
    e.preventDefault();
  }
  return (
    <div
      ref={ref}
      className={styles.wheel}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${label}-${value}`}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKey}
    >
      <div className={styles.spacer} aria-hidden />
      {values.map((v) => (
        <div
          key={v}
          id={`${label}-${v}`}
          role="option"
          aria-selected={v === value}
          className={styles.option}
          onClick={() => onChange(v)}
        >
          {pad(v)}
        </div>
      ))}
      <div className={styles.spacer} aria-hidden />
    </div>
  );
}

export function TimePicker({ value, onChange, onClose, title = 'Time' }: { value: number | null; onChange: (minutes: number | null) => void; onClose: () => void; title?: string }) {
  const { isWide } = useLayout();
  const [draft, setDraft] = useState<number>(value ?? nowMinutes());
  const [isNow, setIsNow] = useState(value === null);
  const [typed, setTyped] = useState(value === null ? '' : hhmm(value));
  const [typedBad, setTypedBad] = useState(false);
  const h = Math.floor(draft / 60);
  const m = draft % 60;

  function set(next: number) {
    setDraft(next);
    setIsNow(false);
    setTyped(hhmm(next));
    setTypedBad(false);
  }
  function done() {
    onChange(isNow ? null : draft);
    onClose();
  }
  function onKeys(e: KeyboardEvent) {
    if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      done();
    }
    if (e.key === 'Escape') onClose();
  }

  return (
    <Modal title={title} onClose={onClose} sheet={!isWide}>
      <div className={styles.body} onKeyDown={onKeys}>
        <div className={styles.chips} role="group" aria-label="Quick picks">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              className={styles.chip}
              aria-pressed={q.value === null ? isNow : !isNow && draft === q.value}
              onClick={() => {
                if (q.value === null) {
                  setIsNow(true);
                  setDraft(nowMinutes());
                  setTyped('');
                } else set(q.value);
              }}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className={styles.wheels} data-now={isNow || undefined}>
          <Wheel label="Hour" values={HOURS} value={h} onChange={(v) => set(v * 60 + m)} />
          <span className={styles.colon} aria-hidden>
            :
          </span>
          <Wheel label="Minute" values={MINUTES} value={m} onChange={(v) => set(h * 60 + v)} />
          <span className={styles.band} aria-hidden />
        </div>
        {isNow && <p className={styles.hint}>Now: the time you save is used.</p>}

        {isWide && (
          <label className={styles.typed}>
            <span>Or type a time</span>
            <input
              value={typed}
              placeholder="14:30"
              inputMode="numeric"
              aria-invalid={typedBad || undefined}
              onChange={(e) => {
                setTyped(e.target.value);
                const t = parseTimeText(e.target.value);
                setTypedBad(e.target.value.trim() !== '' && t === null);
                if (t !== null) {
                  setDraft(t);
                  setIsNow(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!typedBad) done();
                }
              }}
            />
            {typedBad && <em className={styles.error}>Try 14:30, 1430, 2:30 pm or 9h30.</em>}
          </label>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.done} onClick={done} disabled={typedBad}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * A Time field for the stacked forms (label above the control): "Now" in
 * muted text until a time is set, then "14:30" with a clear button.
 * `fieldClassName` is the form's own input class, so it matches the Date
 * field beside it.
 */
export function TimeField({ value, onChange, fieldClassName }: { value: number | null; onChange: (minutes: number | null) => void; fieldClassName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.field}>
      <button type="button" className={`${fieldClassName ?? ''} ${styles.fieldButton}`} data-now={value === null || undefined} onClick={() => setOpen(true)}>
        {value === null ? 'Now' : hhmm(value)}
      </button>
      {value !== null && (
        <button type="button" className={styles.fieldClear} onClick={() => onChange(null)} aria-label="Clear the time">
          ×
        </button>
      )}
      {value === null && <span className={styles.fieldHint}>Uses the time you save</span>}
      {open && <TimePicker value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </span>
  );
}
