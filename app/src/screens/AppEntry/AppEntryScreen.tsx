'use client';

// / for a visitor who looks signed in: the logo while useLogic moves on to
// /loading (or back to /sign-in on a home-screen launch). Signed-out
// visitors never see this; proxy.ts sends them to /sign-in first.

import { useLogic } from '@/src/logic/appEntry/useLogic';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './AppEntryScreen.module.css';

export function AppEntryScreen() {
  useLogic();
  return (
    <div className={styles.page} role="status" aria-label="Opening Dreda">
      <Logo height={72} />
    </div>
  );
}
