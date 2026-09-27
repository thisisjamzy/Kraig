'use client';

// Building blocks for the app's card-style create forms (New task, New
// project, New area, New section) — see CardForm.module.css for the look.
// A screen composes these; anything bespoke (the task type switch, the time
// row) uses the same stylesheet via `cardFormStyles`.

import type { ReactNode } from 'react';
import { ChevronDown, ChevronsUp, ChevronUp, Minus, X, type LucideIcon } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { PROJECT_COLORS, PRIORITY_LEVELS, priorityLabel } from '@/src/viewmodels/projects';
import type { Priority } from '@/src/shared/firestore/types';
import styles from './CardForm.module.css';

export const cardFormStyles = styles;

/** The screen: surface-toned page, big faint watermark title, close button. */
export function CardFormPage({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.watermark}>{title}</h1>
      </div>
      {children}
    </div>
  );
}

/** A card holding a field typed into directly (label + input). */
export function FieldCard({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`${styles.card} ${className ?? ''}`}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}

/** A card whose value opens a picker (bottom sheet); chevron on the right. */
export function PickerCard({
  label,
  onClick,
  children,
  error = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <button type="button" className={`${styles.card} ${styles.pickerCard}`} onClick={onClick}>
      <span className={styles.pickerText}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value} data-error={error || undefined}>
          {children}
        </span>
      </span>
      <ChevronDown size={22} strokeWidth={1.5} className={styles.chevron} aria-hidden />
    </button>
  );
}

/** Full-width primary action at the bottom of the form. */
export function SubmitButton({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <button type="submit" className={styles.primary} disabled={disabled}>
      {children}
    </button>
  );
}

/** Bottom sheet of the app's project/area/section color swatches. */
export function ColorSheet({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (color: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Color" onClose={onClose}>
      <div className={styles.colorGrid}>
        {PROJECT_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={styles.colorSwatch}
            style={{ background: swatch }}
            aria-label={swatch}
            aria-pressed={value === swatch}
            onClick={() => {
              onChange(swatch);
              onClose();
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

// priorityLabel is lowercase ("very important") — capitalized as a value.
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PRIORITY_ICON: Record<Priority, LucideIcon> = { Urgent: ChevronsUp, High: ChevronUp, Medium: Minus, Low: ChevronDown };

/** very important ⌃⌃ / important ⌃ in amber, normal — / low ⌄ in grey. */
export function PriorityIcon({ priority }: { priority: Priority }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={styles.priorityIcon} data-priority={priority} aria-hidden>
      <Icon size={20} strokeWidth={2.25} />
    </span>
  );
}

/** Bottom sheet listing the four priority levels. */
export function PrioritySheet({
  value,
  onChange,
  onClose,
}: {
  value: Priority;
  onChange: (priority: Priority) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Priority" onClose={onClose}>
      <div className={styles.sheetList}>
        {PRIORITY_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={styles.sheetOption}
            aria-pressed={level === value}
            onClick={() => {
              onChange(level);
              onClose();
            }}
          >
            <PriorityIcon priority={level} />
            {capitalize(priorityLabel(level))}
          </button>
        ))}
      </div>
    </Modal>
  );
}
