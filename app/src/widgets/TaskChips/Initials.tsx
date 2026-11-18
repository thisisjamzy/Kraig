// A person's initials on a label hue (Dreda v1.0 bookings and the phone
// lists): someone with no face of their own, such as a booker.

import { initialsOf } from '@/src/viewmodels/people';
import { hueVars, LABEL_HUES } from '@/src/viewmodels/projects';
import styles from './TaskChips.module.css';

export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const hue = LABEL_HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % LABEL_HUES.length];
  const v = hueVars(hue);
  return (
    <span className={styles.initials} style={{ width: size, height: size, background: v.bg, color: v.fg }} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}
