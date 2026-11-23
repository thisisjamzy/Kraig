'use client';

// The transaction panel, drawn from Dreda.figcraft `Form panel / Edit
// transaction` and the Add transaction panel (one structure for both):
//   - header: close (X) on the left, the title centred, templates on the
//     right, each a 44px round button;
//   - the type selector: Expense, Income, Transfer, Savings with their
//     direction arrows; the control never changes shape (a type that can't
//     be reached is disabled, with the reason on hover);
//   - the amount hero: "How much?", the amount in mono 48, a currency chip,
//     and "<wallet> has <available> available";
//   - grouped form rows (icon tile, small label, value, chevron); a row
//     opens its picker (the platform's own select, date or text input);
//   - the impact callout (sunken, 3px brand bar, IMPACT overline);
//   - the footer, pinned: an outlined Delete (edit only) and the primary
//     button filling the rest.
// On tablet and web it fills the right-hand panel (WebFormPanel, 440px); on
// a phone it is the full screen with the footer sticky above the safe area.

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, ChevronRight, FileText, X } from 'lucide-react';
import { ListSheet, useFormPeek } from '@/src/widgets/FormFrame/FormFrame';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useSubmitState } from '@/src/shared/hooks/useSubmitState';
import { TimePicker } from '@/src/shared/ui/TimePicker/TimePicker';
import { hhmm } from '@/src/viewmodels/transactionTime';
import styles from './TransactionPanel.module.css';

// ---------------------------------------------------------------------------
// The panel

export function TxPanel({
  title,
  onClose,
  templatesHref = '/transaction-templates',
  onTemplates,
  primary,
  onSubmit,
  onDelete,
  deleting,
  error,
  overlays,
  children,
}: {
  title: string;
  onClose: () => void;
  templatesHref?: string | null;
  /** Opens the template picker in the form itself (Add transaction); wins over templatesHref. */
  onTemplates?: () => void;
  primary: { label: string; disabled?: boolean; busy?: boolean; busyLabel?: string } | null;
  /** Return the save's promise: the button stays locked until it settles. */
  onSubmit: () => unknown;
  /** Edit only: the outlined Delete in the footer (opens a confirm). */
  onDelete?: () => void;
  deleting?: boolean;
  error?: string | null;
  /** Dialogs the panel opens, rendered outside the form. */
  overlays?: ReactNode;
  children: ReactNode;
}) {
  const peek = useFormPeek();
  const close = peek ? peek.close : onClose;
  const submitState = useSubmitState();
  const { reset } = submitState;
  useEffect(() => {
    if (error) reset();
  }, [error, reset]);
  const phase = error && submitState.phase === 'saved' ? 'idle' : submitState.phase;
  const saving = phase === 'saving' || Boolean(primary?.busy);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!primary || primary.disabled || saving || phase === 'saved') return;
    void submitState.run(onSubmit).catch(() => undefined);
  }

  return (
    <>
      <form className={styles.panel} data-peek={peek ? '' : undefined} onSubmit={submit} noValidate>
        <header className={styles.head}>
          <button type="button" className={styles.round} onClick={close} aria-label="Close" title="Close">
            <X size={20} strokeWidth={2} />
          </button>
          <h1 className={styles.title}>{title}</h1>
          {onTemplates ? (
            <button type="button" className={styles.round} onClick={onTemplates} aria-label="Templates" title="Templates">
              <FileText size={20} strokeWidth={2} />
            </button>
          ) : templatesHref ? (
            <Link href={templatesHref} className={styles.round} aria-label="Templates" title="Templates">
              <FileText size={20} strokeWidth={2} />
            </Link>
          ) : (
            <span className={styles.roundSpacer} aria-hidden />
          )}
        </header>

        <div className={styles.body}>
          {children}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        {primary && (
          <footer className={styles.footer}>
            {onDelete && (
              <button type="button" className={styles.delete} onClick={onDelete} disabled={deleting || saving}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <button
              type="submit"
              className={styles.primary}
              data-phase={saving ? 'saving' : phase}
              aria-busy={saving || undefined}
              disabled={Boolean(primary.disabled || saving || phase === 'saved')}
            >
              {saving ? (
                <>
                  <span className={styles.spinner} aria-hidden />
                  {primary.busyLabel ?? 'Saving…'}
                </>
              ) : phase === 'saved' ? (
                <>
                  <Check size={18} strokeWidth={2.5} aria-hidden />
                  Saved
                </>
              ) : (
                primary.label
              )}
            </button>
          </footer>
        )}
      </form>
      {overlays}
    </>
  );
}

// ---------------------------------------------------------------------------
// Type selector

export type TxKind = 'expense' | 'income' | 'transfer' | 'savings';

const KINDS: { value: TxKind; label: string; icon: typeof ArrowUpRight }[] = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight },
  { value: 'income', label: 'Income', icon: ArrowDownLeft },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { value: 'savings', label: 'Savings', icon: ArrowDownToLine },
];

/** Always four segments; `disabled` greys one out with its reason on hover. */
export function TypeSelector({ value, onChange, disabled = {} }: { value: TxKind; onChange: (next: TxKind) => void; disabled?: Partial<Record<TxKind, string>> }) {
  return (
    <div className={styles.types} role="radiogroup" aria-label="Type">
      {KINDS.map(({ value: kind, label, icon: Icon }) => {
        const reason = disabled[kind];
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={value === kind}
            data-kind={kind}
            className={styles.type}
            disabled={Boolean(reason)}
            title={reason}
            onClick={() => onChange(kind)}
          >
            <Icon size={16} strokeWidth={2} aria-hidden className={styles.typeIcon} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amount hero

export function AmountHero({
  value,
  onChange,
  currency,
  helper,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  currency: string;
  helper?: ReactNode;
  autoFocus?: boolean;
}) {
  const shown = value ? Number(value.replace(/,/g, '')).toLocaleString('en-US', { maximumFractionDigits: 2 }) + (value.endsWith('.') ? '.' : '') : '';
  return (
    <section className={styles.amount} aria-label="Amount">
      <span className={styles.caption}>How much?</span>
      <span className={styles.valueRow}>
        <input
          className={styles.amountInput}
          inputMode="decimal"
          aria-label="Amount"
          placeholder="0"
          value={shown}
          size={Math.max(1, (shown || '0').length)}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        {currency && <span className={styles.currency}>{currency}</span>}
      </span>
      {helper && <span className={styles.helper}>{helper}</span>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rows

/** A white card of rows with hairlines between them; groups sit 16px apart. */
export function RowGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.group} aria-label={label}>
      {children}
    </section>
  );
}

function RowShell({ icon, label, children, chevron = true, className }: { icon: ReactNode; label: string; children: ReactNode; chevron?: boolean; className?: string }) {
  return (
    <div className={`${styles.row} ${className ?? ''}`}>
      <span className={styles.tile} aria-hidden>
        {icon}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {children}
      </span>
      {chevron && <ChevronRight size={18} strokeWidth={2} className={styles.chevron} aria-hidden />}
    </div>
  );
}

export interface RowOption {
  value: string;
  label: string;
}

/**
 * A row whose value opens the platform's own select (a dropdown, or the
 * phone's wheel). `long` lists (a basket, a budget item) open full screen
 * on a phone instead, clear of the notch (ListSheet).
 */
export function SelectRow({
  icon,
  label,
  value,
  onChange,
  options = [],
  groups,
  placeholder = 'Choose',
  display,
  long = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options?: RowOption[];
  groups?: { label: string; options: RowOption[] }[];
  placeholder?: string;
  /** What the row shows, when not the option's own label ("Groceries · 15,000 left"). */
  display?: string;
  long?: boolean;
}) {
  const { isWide } = useLayout();
  const [open, setOpen] = useState(false);
  const all = [...options, ...(groups ?? []).flatMap((g) => g.options)];
  const chosen = all.find((o) => o.value === value);
  const text = display ?? chosen?.label;
  if (long && !isWide) {
    return (
      <>
        <button type="button" className={styles.rowButton} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <RowShell icon={icon} label={label} className={styles.pickRow}>
            <span className={styles.value} data-placeholder={text ? undefined : ''}>
              {text ?? placeholder}
            </span>
          </RowShell>
        </button>
        {open && <ListSheet label={label} value={value} options={options} groups={groups} onPick={onChange} onClose={() => setOpen(false)} />}
      </>
    );
  }
  return (
    <RowShell icon={icon} label={label} className={styles.pickRow}>
      <span className={styles.value} data-placeholder={text ? undefined : ''}>
        {text ?? placeholder}
      </span>
      <select className={styles.overlay} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {(groups ?? []).map((g) =>
          g.options.length ? (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
    </RowShell>
  );
}

/** A row whose value is typed in place (description, note, fees). */
export function InputRow({
  icon,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
  /** A small line under the value ("From your fee schedule"). */
  note?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className={styles.rowLabel} onClick={() => ref.current?.focus()}>
      <RowShell icon={icon} label={label}>
        <input ref={ref} className={styles.valueInput} value={value} placeholder={placeholder} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
        {note && <span className={styles.rowNote}>{note}</span>}
      </RowShell>
    </label>
  );
}

const DAY_WORDS = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** A date row: "Wednesday, 4 November", the platform's date picker on tap. */
export function DateRow({ icon, label, value, onChange }: { icon: ReactNode; label: string; value: string; onChange: (iso: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const day = value ? new Date(`${value}T00:00:00`) : null;
  const words = day ? DAY_WORDS.format(day).replace(/^(\w+) /, '$1, ') : 'Choose a date';
  return (
    <RowShell icon={icon} label={label} className={styles.pickRow}>
      <span className={styles.value} data-placeholder={day ? undefined : ''}>
        {value === iso ? `Today, ${words.split(', ')[1]}` : words}
      </span>
      <input
        ref={ref}
        type="date"
        className={styles.overlay}
        value={value}
        aria-label={label}
        onClick={() => {
          try {
            ref.current?.showPicker?.();
          } catch {
            // Some browsers only open it from the input itself; the tap already did.
          }
        }}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </RowShell>
  );
}

/**
 * The Time row, made like the Date row (owner, 23 Nov 2026): "Now" in
 * muted text with "Uses the time you save" under it until a time is set,
 * then "14:30" with a clear button back to Now. Opens TimePicker.
 */
export function TimeRow({ icon, label = 'Time', value, onChange }: { icon: ReactNode; label?: string; value: number | null; onChange: (minutes: number | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.timeRow}>
      <RowShell icon={icon} label={label} className={styles.pickRow} chevron={value === null}>
        <button type="button" className={styles.overlayButton} onClick={() => setOpen(true)} aria-label={value === null ? `${label}: now, the time you save` : `${label}: ${hhmm(value)}`} />
        <span className={styles.value} data-placeholder={value === null ? '' : undefined}>
          {value === null ? 'Now' : hhmm(value)}
        </span>
        {value === null && <span className={styles.rowNote}>Uses the time you save</span>}
      </RowShell>
      {value !== null && (
        <button type="button" className={styles.clearTime} onClick={() => onChange(null)} aria-label="Clear the time, use the time you save">
          <X size={16} strokeWidth={2} />
        </button>
      )}
      {open && <TimePicker value={value} onChange={onChange} onClose={() => setOpen(false)} title={label} />}
    </div>
  );
}

/** Date and Time together: one row each on a phone; side by side, Date wider, on web. */
export function DateTimeRows({ children }: { children: ReactNode }) {
  return <div className={styles.dateTime}>{children}</div>;
}

/** A row that only shows a value. */
export function StaticRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <RowShell icon={icon} label={label} chevron={false}>
      <span className={styles.value}>{value}</span>
    </RowShell>
  );
}

/** The on/off row: label left, switch right (no icon tile). */
export function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleText}>
        <span>{label}</span>
        {description && <span className={styles.toggleHint}>{description}</span>}
      </span>
      <input type="checkbox" role="switch" className={styles.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** A short note under a group (a hint, a chip, a field error). */
export function RowNote({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <p className={styles.note} data-tone={tone}>
      {children}
    </p>
  );
}

/** A small outlined action under a group ("Pay the full 25,000 due"). */
export function RowChip({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={styles.chip} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Impact

export function ImpactCallout({ children }: { children: ReactNode }) {
  return (
    <aside className={styles.impact}>
      <span className={styles.overline}>Impact</span>
      <p className={styles.impactBody}>{children}</p>
    </aside>
  );
}
