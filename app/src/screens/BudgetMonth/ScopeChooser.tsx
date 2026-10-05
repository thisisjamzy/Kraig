'use client';

// Editing a recurring line asks which months it means: "This month only"
// (an exception) or "This and future months" (the template changes from
// here). useScopeChooser returns ask(), resolving to the choice or null
// when the dialog is closed, and the dialog to render. askRecorded() is
// the follow-up when that month already has a recorded payment: "Also
// update this month's recorded payment?", true only for "Update it".

import { useRef, useState } from 'react';
import { Modal } from '@/src/widgets/Modal/Modal';
import type { EditScope } from '@/src/shared/firestore/bucketBudget';
import styles from './BudgetMonth.module.css';

export function useScopeChooser() {
  const [open, setOpen] = useState<{ name: string; month: string } | null>(null);
  const resolver = useRef<((scope: EditScope | null) => void) | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);
  const recordedResolver = useRef<((update: boolean) => void) | null>(null);

  function askRecorded(name: string): Promise<boolean> {
    setRecorded(name);
    return new Promise((resolve) => {
      recordedResolver.current = resolve;
    });
  }
  function recordedDone(update: boolean) {
    recordedResolver.current?.(update);
    recordedResolver.current = null;
    setRecorded(null);
  }

  function ask(name: string, month: string): Promise<EditScope | null> {
    setOpen({ name, month });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }
  function done(scope: EditScope | null) {
    resolver.current?.(scope);
    resolver.current = null;
    setOpen(null);
  }

  const dialog = open ? (
    <Modal title={`Change ${open.name}`} onClose={() => done(null)}>
      <p className={styles.scopeHint}>This line repeats. Which months should change?</p>
      <div className={styles.scopeButtons}>
        <button type="button" className={styles.scopeButton} onClick={() => done('month')}>
          <strong>This month only</strong>
          <span>The other months keep their amount and date.</span>
        </button>
        <button type="button" className={styles.scopeButton} onClick={() => done('future')}>
          <strong>This and future months</strong>
          <span>Earlier months stay as they were.</span>
        </button>
      </div>
    </Modal>
  ) : recorded ? (
    <Modal title="Also update this month's recorded payment?" onClose={() => recordedDone(false)}>
      <p className={styles.scopeHint}>{recorded} already has a payment recorded this month. It keeps its amount unless you update it.</p>
      <div className={styles.scopeButtons}>
        <button type="button" className={styles.scopeButton} onClick={() => recordedDone(true)}>
          <strong>Update it</strong>
          <span>The recorded payment takes the new amount.</span>
        </button>
        <button type="button" className={styles.scopeButton} onClick={() => recordedDone(false)}>
          <strong>Leave it</strong>
          <span>Only the plan changes.</span>
        </button>
      </div>
    </Modal>
  ) : null;

  return { ask, askRecorded, dialog };
}
