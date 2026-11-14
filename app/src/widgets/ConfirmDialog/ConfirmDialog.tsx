'use client';

// A styled stand-in for window.confirm(): every destructive action routes
// through this instead of firing immediately, so a stray tap can't silently
// lose data. Three shapes (Dreda.figcraft `Confirmations / Web`), and archive
// is always offered before delete:
//   - archive instead: Cancel · Archive instead · Delete (pass `archiveInstead`);
//   - plain archive or discard: Cancel · the action (`tone="neutral"`);
//   - type the name to delete: the confirm stays off until `typeToConfirm` is
//     typed exactly.

import { useId, useState } from 'react';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  archiveInstead,
  typeToConfirm,
  tone = 'danger',
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Offers archiving before deleting. */
  archiveInstead?: { label: string; onSelect: () => void };
  /** The name to type before the confirm turns on. */
  typeToConfirm?: string;
  /** neutral: an archive or discard, not a delete. */
  tone?: 'danger' | 'neutral';
}) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const locked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm.trim();
  return (
    <Modal title={title} onClose={onCancel}>
      <p className={styles.message}>{message}</p>
      {typeToConfirm !== undefined && (
        <label className={styles.typeField} htmlFor={inputId}>
          <span>
            Type <strong>{typeToConfirm}</strong> to confirm
          </span>
          <input id={inputId} className={styles.typeInput} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          {cancelLabel}
        </button>
        {archiveInstead && (
          <button type="button" className={styles.cancelButton} onClick={archiveInstead.onSelect}>
            {archiveInstead.label}
          </button>
        )}
        <button type="button" className={styles.confirmButton} data-tone={tone} onClick={onConfirm} disabled={locked}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
