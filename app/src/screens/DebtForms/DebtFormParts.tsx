'use client';

// The pieces every debt form shares, on the app's card form
// (src/widgets/CardForm, as New task and Add transaction): the frame (a
// zero-radius card form, in a 560px side peek on medium screens and up),
// segmented choices with a one-line hint, the live Impact card, and the
// account and date sheets.

import type { ReactNode } from 'react';
import { Calendar as HeroCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { FieldCard, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { FormChrome } from '@/src/widgets/FormFrame/FormFrame';
import { Modal } from '@/src/widgets/Modal/Modal';
import { WebFormPanel } from '@/src/widgets/WebFormPanel/WebFormPanel';
import { formatMoney } from '@/src/widgets/Money/Money';
import styles from './DebtForms.module.css';

export const fmt = formatMoney;

const pad = (n: number) => String(n).padStart(2, '0');
/** yyyy-mm-dd in local time. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function fromIsoDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
/** "Sat 3 Oct 2026" */
export function dayText(iso: string): string {
  return fromIsoDay(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The form's frame (the form standard's FormChrome); `inPanel` draws it as
 * the 560px side peek, whose "Open as full page" PanelHost provides.
 */
export function DebtFormFrame({ title, inPanel, onClose, children }: { title: string; inPanel: boolean; onClose: () => void; children: ReactNode }) {
  const page = (
    <FormChrome title={title} onClose={onClose}>
      {children}
    </FormChrome>
  );
  return inPanel ? (
    <WebFormPanel onClose={onClose} width={560}>
      {page}
    </WebFormPanel>
  ) : (
    page
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** A card with a segmented control; the chosen option's hint underneath. */
export function SegmentedCard<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
}) {
  const hint = options.find((o) => o.value === value)?.hint;
  return (
    <div className={cf.card}>
      <span className={cf.label}>{label}</span>
      <div className={cf.segmented} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={cf.segment}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

/** A large amount field with the currency beside it. */
export function AmountCard({ label, value, onChange, currency, autoFocus }: { label: string; value: string; onChange: (v: string) => void; currency: string; autoFocus?: boolean }) {
  return (
    <FieldCard label={label}>
      <span className={styles.amountRow}>
        <input
          className={`${cf.valueInput} ${styles.amountInput}`}
          inputMode="decimal"
          placeholder="0"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          aria-label={label}
        />
        <span className={styles.currency}>{currency}</span>
      </span>
    </FieldCard>
  );
}

/** "Impact": what saving changes in balances and figures, live. */
export function ImpactCard({ lines, warnings = [], error }: { lines: string[]; warnings?: string[]; error?: string | null }) {
  return (
    <section className={styles.impact} aria-live="polite" aria-label="Impact">
      <span className={cf.label}>Impact</span>
      {error ? (
        <p className={styles.impactError} role="alert">
          {error}
        </p>
      ) : (
        <ul className={styles.impactLines}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {!error &&
        warnings.map((w) => (
          <p key={w} className={styles.impactWarning}>
            {w}
          </p>
        ))}
    </section>
  );
}

export interface AccountOption {
  id: string;
  name: string;
  currentBalance?: number;
}

export function AccountSheet({
  title,
  accounts,
  value,
  onChange,
  onClose,
  extra,
}: {
  title: string;
  accounts: AccountOption[];
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
  /** More choices after the accounts (any income, savings…). */
  extra?: { id: string; label: string; hint?: string }[];
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className={cf.sheetList}>
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`${cf.sheetOption} ${cf.sheetOptionStacked}`}
            aria-pressed={a.id === value}
            onClick={() => {
              onChange(a.id);
              onClose();
            }}
          >
            <span className={cf.sheetOptionName}>{a.name}</span>
            {a.currentBalance !== undefined && <span className={cf.sheetOptionHint}>{fmt(a.currentBalance)}</span>}
          </button>
        ))}
        {extra?.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`${cf.sheetOption} ${cf.sheetOptionStacked}`}
            aria-pressed={x.id === value}
            onClick={() => {
              onChange(x.id);
              onClose();
            }}
          >
            <span className={cf.sheetOptionName}>{x.label}</span>
            {x.hint && <span className={cf.sheetOptionHint}>{x.hint}</span>}
          </button>
        ))}
        {accounts.length === 0 && !extra?.length && <p className={cf.sheetEmpty}>No accounts yet.</p>}
      </div>
    </Modal>
  );
}

export function DateSheet({ title, value, onChange, onClose }: { title: string; value: string; onChange: (iso: string) => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <HeroCalendar.Root
        defaultFocusedValue={parseDate(value)}
        value={parseDate(value)}
        onChange={(next) => {
          if (next) {
            onChange(next.toString());
            onClose();
          }
        }}
      >
        <HeroCalendar.Header className={cf.calendarHeader}>
          <HeroCalendar.NavButton slot="previous" className={cf.calendarNavButton} />
          <HeroCalendar.Heading className={cf.calendarHeading} />
          <HeroCalendar.NavButton slot="next" className={cf.calendarNavButton} />
        </HeroCalendar.Header>
        <HeroCalendar.Grid className={cf.calendarGrid}>
          <HeroCalendar.GridHeader>{(day) => <HeroCalendar.HeaderCell className={cf.weekdayCell}>{day}</HeroCalendar.HeaderCell>}</HeroCalendar.GridHeader>
          <HeroCalendar.GridBody>
            {(cellDate) => (
              <HeroCalendar.Cell date={cellDate} className={cf.dayCell}>
                {({ formattedDate }) => <span className={cf.dayCellInner}>{formattedDate}</span>}
              </HeroCalendar.Cell>
            )}
          </HeroCalendar.GridBody>
        </HeroCalendar.Grid>
      </HeroCalendar.Root>
    </Modal>
  );
}

/** A switch row inside a card ("Paid from one of my accounts"). */
export function ToggleCard({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`${cf.card} ${cf.doneCard}`}>
      <span className={styles.toggleText}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={cf.switch} aria-hidden />
    </label>
  );
}

/** Below the button: a save error. */
export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p className={cf.formError} role="alert">
      {message}
    </p>
  ) : null;
}
