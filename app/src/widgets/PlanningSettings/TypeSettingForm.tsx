'use client';

// Add or change a task type's time block (Planning settings, phone and
// web): name, days, start and end, average length, daily cap, auto.

import { useState } from 'react';
import type { TypeSetting } from '@/src/viewmodels/planning-settings';
import { WEEKDAY_SHORT } from '@/src/viewmodels/scheduling-links';
import { Modal } from '@/src/widgets/Modal/Modal';
import { Switch } from '@/src/widgets/TaskChips/Switch';
import styles from './TypeSettingForm.module.css';

export function TypeSettingForm({
  initial,
  isNew,
  sheet,
  onSave,
  onCancel,
  onRemove,
}: {
  initial: TypeSetting;
  isNew: boolean;
  sheet?: boolean;
  onSave: (t: TypeSetting) => string | null;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [t, setT] = useState<TypeSetting>(initial);
  const [error, setError] = useState<string | null>(null);
  const up = <K extends keyof TypeSetting>(k: K, v: TypeSetting[K]) => setT((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={isNew ? 'New task type' : t.type} onClose={onCancel} sheet={sheet}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          setError(onSave(t));
        }}
      >
        {isNew && (
          <label className={styles.field}>
            Name
            <input className={styles.input} value={t.type} placeholder="Errands" onChange={(e) => up('type', e.target.value)} autoFocus />
          </label>
        )}
        <div className={styles.field}>
          Days
          <div className={styles.days} role="group" aria-label="Days">
            {WEEKDAY_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={t.days.includes(i)}
                onClick={() => up('days', t.days.includes(i) ? t.days.filter((x) => x !== i) : [...t.days, i].sort())}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            Starts
            <input type="time" className={styles.input} value={t.from} onChange={(e) => up('from', e.target.value)} />
          </label>
          <label className={styles.field}>
            Ends
            <input type="time" className={styles.input} value={t.to} onChange={(e) => up('to', e.target.value)} />
          </label>
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            Average, minutes
            <input type="number" min={5} step={5} className={styles.input} value={t.average} onChange={(e) => up('average', Math.max(5, Number(e.target.value) || 5))} />
          </label>
          <label className={styles.field}>
            Most a day
            <input type="number" min={1} className={styles.input} value={t.perDay ?? ''} placeholder="No cap" onChange={(e) => up('perDay', e.target.value ? Math.max(1, Number(e.target.value)) : null)} />
          </label>
        </div>
        <label className={styles.switchRow}>
          Plan my day places these
          <Switch checked={t.auto} onChange={(v) => up('auto', v)} label="Plan my day places these" />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          {!isNew && (
            <button type="button" className={styles.remove} onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.primary}>
            {isNew ? 'Add type' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
