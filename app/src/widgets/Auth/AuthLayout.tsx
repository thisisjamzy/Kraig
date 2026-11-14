// The sign-in and sign-up frame (Dreda.figcraft `Login / Web`, `Login /
// Phone`, `Sign up / Web`). Web: the form column (logo, the form centred,
// the legal line) beside the purple brand panel with the headline, three
// tilted wallet cards and the "Safe to spend today" chip. Phone: the panel
// becomes the top of the page (reversed logo, two cards) and the form sits
// on a white sheet with rounded top corners. Pure layout: the screen passes
// its form as children.

import type { ReactNode } from 'react';
import { Logo } from '@/src/widgets/Logo/Logo';
import { WalletCard } from '@/src/widgets/Money/WalletCard';
import styles from './AuthLayout.module.css';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.formColumn}>
        <div className={styles.top}>
          <Logo height={48} />
        </div>
        <div className={styles.sheet}>{children}</div>
        <p className={styles.legal}>© {new Date().getFullYear()} Dreda  ·  Privacy  ·  Terms</p>
      </div>

      <aside className={styles.panel} aria-hidden>
        <span className={styles.decorA} />
        <span className={styles.decorB} />
        <div className={styles.phoneLogo}>
          <Logo height={48} variant="dark" alt="" />
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Money and time, in one place</p>
          <p className={styles.headline}>Know what you can spend today, and where your week is going.</p>
          <p className={styles.body}>Every wallet, budget, debt and task in one calm view built for early career professionals.</p>
        </div>
        <WalletCard className={`${styles.card} ${styles.cardLilac}`} tone="lilac" type="Cash" name="Pocket cash" last4="0001" available="127,500" required="*****" />
        <WalletCard className={`${styles.card} ${styles.cardInk}`} tone="ink" type="Bank" name="SGBC Current" last4="2210" available="1,642,000" required="450,000" />
        <WalletCard className={`${styles.card} ${styles.cardLime}`} tone="lime" type="Savings" name="Afriland Savings" last4="0937" available="1,250,000" required="*****" />
        <div className={styles.safeChip}>
          <span className={styles.safeLabel}>Safe to spend today</span>
          <span className={styles.safeValue}>18,400 XAF</span>
        </div>
      </aside>
    </div>
  );
}
