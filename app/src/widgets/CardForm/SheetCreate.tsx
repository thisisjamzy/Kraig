'use client';

// "+ New project" (area, section) at the foot of a picker sheet: tap it,
// type a name, Create. The new record is picked and the sheet closes, so
// the form underneath carries on where it was.

import { useState } from 'react';
import { Plus } from 'lucide-react';
import styles from './CardForm.module.css';

export function SheetCreate({
  noun,
  initialName = '',
  onCreate,
}: {
  /** "project", "area", "section". */
  noun: string;
  /** What was typed in the sheet's search, if anything. */
  initialName?: string;
  /** Creates it and picks it; rejects with the reason it couldn't. */
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className={`${styles.sheetOption} ${styles.sheetCreateToggle}`}
        onClick={() => {
          setName(initialName);
          setOpen(true);
        }}
      >
        <Plus size={18} strokeWidth={2} aria-hidden />
        {initialName.trim() ? `New ${noun} "${initialName.trim()}"` : `New ${noun}`}
      </button>
    );
  }

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not create this ${noun}.`);
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.sheetCreate}
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <label className={styles.searchField}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${noun} name`} aria-label={`New ${noun} name`} autoFocus />
      </label>
      {error && <p className={styles.sheetCreateError}>{error}</p>}
      <div className={styles.sheetCreateActions}>
        <button type="button" className={styles.sheetCreateCancel} onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={styles.sheetCreateSubmit} disabled={!name.trim() || saving}>
          {saving ? 'Creating…' : `Create ${noun}`}
        </button>
      </div>
    </form>
  );
}
