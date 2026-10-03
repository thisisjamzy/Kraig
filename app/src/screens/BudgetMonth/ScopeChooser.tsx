'use client';

// Editing a recurring line asks which months it means: "This month only"
// (an exception) or "This and future months" (the template changes from
// here). useScopeChooser returns ask(), resolving to the choice or null
// when the dialog is closed, and the dialog to render.

import { useRef, useState } from 'react';
import { Modal } from '@/src/widgets/Modal/Modal';
import type { EditScope } from '@/src/shared/firestore/bucketBudget';
import styles from './BudgetMonth.module.css';

export function useScopeChooser() {
  const [open, setOpen] = useState<{ name: string; month: string } | null>(null);
  const resolver = useRef<((scope: EditScope | null) => void) | null>(null);

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
  ) : null;

  return { ask, dialog };
}
