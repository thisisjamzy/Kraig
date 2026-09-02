'use client';

// A styled stand-in for window.confirm() — every destructive action in this
// app (archive a goal/debt, delete a line item, ...) routes through this
// instead of firing immediately, so a stray tap can't silently lose data.

import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={styles.confirmButton} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
