// The small Google Calendar mark — a "G" in a ring, beside anything that
// came from (or is about) Google Calendar.

import styles from './GoogleMark.module.css';

export function GoogleMark({ size = 14 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size, fontSize: size * 0.64 }} role="img" aria-label="Google Calendar">
      G
    </span>
  );
}
