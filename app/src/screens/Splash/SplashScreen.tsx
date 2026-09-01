'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import logomark from '@/public/logomark_alt.png';
import { useStrings } from '@/src/strings/useStrings';
import styles from './SplashScreen.module.css';

export function SplashScreen() {
  const strings = useStrings();

  return (
    <div className={styles.page}>
      <div className={styles.logoRow}>
        <span className={styles.logoBadge}>
          <Image src={logomark} alt="" width={24} height={24} />
        </span>
        <span className={styles.wordmark}>{strings.splash.wordmark}</span>
      </div>

      <div className={styles.spacerLarge} aria-hidden="true" />

      <div className={styles.body}>
        <h1 className={styles.headline}>{strings.splash.headline}</h1>
        <p className={styles.tagline}>{strings.splash.tagline}</p>
      </div>

      <div className={styles.spacerSmall} aria-hidden="true" />

      <div className={styles.footer}>
        <Link href="/sign-in" className={styles.ctaButton}>
          {strings.splash.getStarted}
          <ArrowUpRight size={18} strokeWidth={2.5} />
        </Link>
        <p className={styles.inviteNote}>
          {strings.splash.inviteNotePrefix}{' '}
          <span className={styles.inviteLink}>{strings.splash.inviteLink}</span>
        </p>
      </div>
    </div>
  );
}
