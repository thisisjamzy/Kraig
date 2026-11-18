// Dreda v1.0 `Toggle` (61814, 61816): a 44 by 26 switch, purple when on.
// Shared by the phone and web lines.

import styles from './TaskChips.module.css';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return <input type="checkbox" role="switch" className={styles.switch} checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />;
}
