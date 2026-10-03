// Notion-style tags: a pale background and darker text of the same hue,
// sentence case, 12 to 13px, a 4px radius. The colors are Notion's own
// tag palette (light and dark).

import type { ReactNode } from 'react';
import styles from './TaskDb.module.css';

export type TagColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red';

/** The accent (dot, left bar) of each tag color. */
export const TAG_ACCENT: Record<TagColor, string> = {
  gray: '#9b9a97',
  brown: '#9f6b53',
  orange: '#d9730d',
  yellow: '#cb912f',
  green: '#448361',
  blue: '#337ea9',
  purple: '#9065b0',
  pink: '#c14c8a',
  red: '#d44c47',
};

export function Tag({ color = 'gray', dot, children, title }: { color?: TagColor; dot?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={styles.tag} data-color={color} title={title}>
      {dot && <span className={styles.tagDot} style={{ background: TAG_ACCENT[color] }} aria-hidden />}
      {children}
    </span>
  );
}
