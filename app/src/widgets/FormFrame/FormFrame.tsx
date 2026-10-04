'use client';

// The one form standard (docs/UI-PLATFORM-RULES.md), shared by every form.
//
// Phone (under 768px): the BASELINE full-screen form page. Its header is
// the big watermark title with a close button (`phoneHeader="watermark"`,
// the card forms) or the usual screen header with an up arrow
// (`phoneHeader="bar"`, the forms that had one). The primary button sits in
// a sticky bar at the bottom, above the safe area.
//
// Tablet and web (768px and up): inside a side peek (FormPeek, opened from
// the URL by PanelHost) the frame shows "Open as full page" and close at
// the top, then a plain 24px title with its context as a muted line. Opened
// as its own page, the same frame sits in a 640px column, never stretched.
//
// Both: each field in its own card (FieldCard, PickerCard, SegmentedField,
// FieldRow for two half-width cards, MoreOptions for the optional ones),
// an Impact card above the button whenever money changes, then one
// full-width primary button named verb plus object, disabled until valid.
// No corner checkmark buttons.

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Maximize2, X } from 'lucide-react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { FormPeekContext, useFormPeek, type FormPeekState } from '@/src/shared/navigation/formPeekContext';
import cf from '@/src/widgets/CardForm/CardForm.module.css';
import styles from './FormFrame.module.css';

// ---------------------------------------------------------------------------
// Where the form is shown (src/shared/navigation/formPeekContext.ts)

export { FormPeekContext, useFormPeek, type FormPeekState };

/**
 * A form's exits. In a peek, closing and finishing close the peek (unless
 * the form goes somewhere else after saving); on a page, the form's own
 * close and done (both replace the form's history entry).
 */
export function useFormExits({ close, done }: { close: () => void; done?: () => void }) {
  const peek = useFormPeek();
  return {
    inPeek: Boolean(peek),
    close: peek ? peek.close : close,
    done: peek ? peek.close : (done ?? close),
  };
}

// ---------------------------------------------------------------------------
// The frame

export interface PrimaryAction {
  /** Verb plus object: "Add basket item". */
  label: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  tone?: 'danger';
}

export function FormFrame({
  title,
  context,
  onClose,
  phoneHeader = 'watermark',
  impact,
  primary,
  onSubmit,
  error,
  after,
  overlays,
  children,
}: {
  title: string;
  /** A muted line under the title on wide screens: "In Running Douala". */
  context?: ReactNode;
  /** Close on a page (in a peek, the peek's own close is used). */
  onClose: () => void;
  phoneHeader?: 'watermark' | 'bar';
  /** The Impact card's body, when money changes. */
  impact?: ReactNode;
  primary: PrimaryAction | null;
  onSubmit: () => void;
  /** A save error, shown above the button. */
  error?: string | null;
  /** Under the primary button: secondary actions such as Delete. */
  after?: ReactNode;
  /** Sheets and dialogs the form opens, rendered outside the <form>. */
  overlays?: ReactNode;
  children: ReactNode;
}) {
  const { isWide } = useLayout();
  const peek = useFormPeek();
  const close = peek ? peek.close : onClose;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (primary && !primary.disabled && !primary.busy) onSubmit();
  }

  const button = primary && (
    <button type="submit" className={styles.primary} data-tone={primary.tone} disabled={Boolean(primary.disabled || primary.busy)}>
      {primary.busy ? (primary.busyLabel ?? 'Saving…') : primary.label}
    </button>
  );
  const body = (
    <>
      <div className={styles.cards}>{children}</div>
      {impact && <ImpactCard>{impact}</ImpactCard>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (!isWide) {
    return (
      <>
        <form className={`${cf.page} ${styles.phone}`} onSubmit={submit} noValidate>
          {phoneHeader === 'watermark' ? (
            <div className={cf.top}>
              <button type="button" className={cf.closeButton} onClick={close} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
              <h1 className={cf.watermark}>{title}</h1>
            </div>
          ) : (
            <header className={styles.bar}>
              <button type="button" className={styles.up} onClick={close} aria-label="Back">
                <ArrowLeft size={20} strokeWidth={2} />
              </button>
              <h1 className={styles.barTitle}>{title}</h1>
            </header>
          )}
          {body}
          {after && <div className={styles.after}>{after}</div>}
          {button && <div className={styles.stickyBar}>{button}</div>}
        </form>
        {overlays}
      </>
    );
  }

  return (
    <>
      <form className={`${cf.page} ${styles.wide}`} data-peek={peek ? '' : undefined} onSubmit={submit} noValidate>
        <div className={styles.wideTools}>
          {peek?.fullPageHref && (
            <Link href={peek.fullPageHref} className={styles.tool} aria-label="Open as full page" title="Open as full page">
              <Maximize2 size={16} strokeWidth={2} />
            </Link>
          )}
          <button type="button" className={styles.tool} onClick={close} aria-label="Close" title="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <header className={styles.wideHeader}>
          <h1 className={styles.wideTitle}>{title}</h1>
          {context && <p className={styles.wideContext}>{context}</p>}
        </header>
        {body}
        {button}
        {after && <div className={styles.after}>{after}</div>}
      </form>
      {overlays}
    </>
  );
}

// ---------------------------------------------------------------------------
// Field cards

/** A field typed into directly: label above, value below, error inside. */
export function FieldCard({ label, error, children, className }: { label: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={`${cf.card} ${className ?? ''}`} data-invalid={error ? '' : undefined}>
      <span className={cf.label}>{label}</span>
      {children}
      {error && <span className={styles.fieldError}>{error}</span>}
    </label>
  );
}

/** A field whose value opens a picker; chevron on the right. */
export function PickerField({
  label,
  onClick,
  placeholder = false,
  error,
  children,
}: {
  label: string;
  onClick: () => void;
  /** The value shown is a placeholder (light grey). */
  placeholder?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`${cf.card} ${cf.pickerCard}`} onClick={onClick} data-invalid={error ? '' : undefined}>
      <span className={cf.pickerText}>
        <span className={cf.label}>{label}</span>
        <span className={cf.value} data-placeholder={placeholder || undefined}>
          {children}
        </span>
        {error && <span className={styles.fieldError}>{error}</span>}
      </span>
      <ChevronDown size={22} strokeWidth={1.5} className={cf.chevron} aria-hidden />
    </button>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A picker field backed by the platform's own select: the phone's wheel,
 * a dropdown on wide screens. `groups` adds labelled sections.
 */
export function SelectField({
  label,
  value,
  onChange,
  options = [],
  groups,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options?: SelectOption[];
  groups?: { label: string; options: SelectOption[] }[];
  /** Shown (light grey) while nothing is chosen; also the empty option. */
  placeholder?: string;
  error?: string | null;
}) {
  const all = [...options, ...(groups ?? []).flatMap((g) => g.options)];
  const chosen = all.find((o) => o.value === value);
  return (
    <label className={`${cf.card} ${cf.pickerCard} ${styles.select}`} data-invalid={error ? '' : undefined}>
      <span className={cf.pickerText}>
        <span className={cf.label}>{label}</span>
        <span className={cf.value} data-placeholder={chosen ? undefined : ''}>
          {chosen ? chosen.label : (placeholder ?? 'Choose')}
        </span>
        {error && <span className={styles.fieldError}>{error}</span>}
      </span>
      <ChevronDown size={22} strokeWidth={1.5} className={cf.chevron} aria-hidden />
      <select className={styles.nativeSelect} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
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
    </label>
  );
}

/** An on/off choice as a field card: label and description left, switch right. */
export function SwitchField({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`${cf.card} ${styles.switchField}`}>
      <span className={styles.switchText}>
        <span className={styles.switchLabel}>{label}</span>
        {description && <span className={styles.hint}>{description}</span>}
      </span>
      <input type="checkbox" role="switch" className={styles.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Two to four options as a segmented control inside the card. */
export function SegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T | null;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div className={cf.card}>
      <span className={cf.label}>{label}</span>
      <div className={cf.segmented} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className={cf.segment} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

/** Two related fields side by side (Start | End, Amount | Every); they stack under 360px. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className={styles.fieldRow}>{children}</div>;
}

/** The optional fields, folded under "More options" at the bottom. */
export function MoreOptions({ children, defaultOpen = false, label = 'More options' }: { children: ReactNode; defaultOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.more}>
      <button type="button" className={styles.moreToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <ChevronDown size={18} strokeWidth={2} className={styles.moreChevron} data-open={open || undefined} aria-hidden />
      </button>
      {open && <div className={styles.cards}>{children}</div>}
    </div>
  );
}

/** What the form changes, in words: "Adds 35,000 to Running Douala for October and every month after." */
export function ImpactCard({ children }: { children: ReactNode }) {
  return (
    <section className={styles.impact} aria-live="polite" aria-label="Impact">
      <span className={cf.label}>Impact</span>
      <div className={styles.impactBody}>{children}</div>
    </section>
  );
}

/** The frame's own classes (plain inputs inside field cards: formFrameStyles.input). */
export const formFrameStyles = styles;
