'use client';

// Shared checkbox list of every data entity Settings > Data's export and
// template-download screens can produce a sheet for — one place so the two
// screens' pickers can never drift apart.

import { ENTITY_ORDER, ENTITY_DEFS, type EntityKey } from '@/src/shared/firestore/dataEntities';
import styles from './EntityPicker.module.css';

export function EntityPicker({
  selected,
  onChange,
  keys = ENTITY_ORDER,
}: {
  /** The entities offered; every one when left out. */
  keys?: EntityKey[];
  selected: Set<EntityKey>;
  onChange: (next: Set<EntityKey>) => void;
}) {
  function toggle(key: EntityKey) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(keys));
  }

  function selectNone() {
    onChange(new Set());
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbarRow}>
        <button type="button" className={styles.linkButton} onClick={selectAll}>
          Select all
        </button>
        <button type="button" className={styles.linkButton} onClick={selectNone}>
          Select none
        </button>
      </div>
      <div className={styles.list}>
        {keys.map((key) => (
          <label key={key} className={styles.row}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selected.has(key)}
              onChange={() => toggle(key)}
            />
            {ENTITY_DEFS[key].label}
          </label>
        ))}
      </div>
    </div>
  );
}
