// A wallet as a card (Dreda.figcraft `Wallet card`): 232 by 360, a 22px
// radius, two decor circles, then type and name with the contactless mark,
// the wallet number, and the available and required amounts with the logo.
// Tones: purple, lilac, ink, lime. Used by the dashboard's wallet row, the
// wallets page and the sign-in panel.

import Image from 'next/image';
import { Nfc } from 'lucide-react';
import mark from '@/public/brand/dreda-mark.png';
import { formatMaskedNumber } from '@/src/viewmodels/wallets';
import type { WalletHue } from '@/src/shared/firestore/types';
import styles from './WalletCard.module.css';

export type WalletTone = 'purple' | 'lilac' | 'ink' | 'lime';

export function WalletCard({
  tone,
  hue,
  type,
  name,
  last4,
  available,
  required,
  currency = 'XAF',
  className,
  style,
}: {
  tone: WalletTone;
  /** The wallet's own colour (owner, 23 Nov 2026): a label hue tints the
   *  card (its bg, text in its fg) and overrides the tone. */
  hue?: WalletHue | null;
  /** "Bank", "Mobile money", "Cash", "Savings". */
  type: string;
  name: string;
  /** The last four of the wallet number, or anything short. */
  last4: string;
  /** Already formatted. */
  available: string;
  /** Already formatted; "*****" hides it. */
  required: string;
  currency?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className ? `${styles.card} ${className}` : styles.card}
      data-tone={hue ? undefined : tone}
      data-hue={hue || undefined}
      style={hue ? ({ '--hue-bg': `var(--label-${hue}-bg)`, '--hue-fg': `var(--label-${hue}-fg)`, '--hue-solid': `var(--label-${hue}-solid)`, ...style } as React.CSSProperties) : style}
    >
      <span className={styles.decor1} aria-hidden />
      <span className={styles.decor2} aria-hidden />
      <div className={styles.top}>
        <div className={styles.identity}>
          <span className={styles.type}>{type}</span>
          <span className={styles.name}>{name}</span>
        </div>
        <Nfc size={24} strokeWidth={2} aria-hidden className={styles.nfc} />
      </div>
      <div className={styles.number}>
        <span className={styles.type}>Wallet number</span>
        <span className={styles.masked} aria-label={`Wallet number ending ${last4}`}>
          {formatMaskedNumber(last4).split(' ').map((group, i) => (
            <span key={i} className={group.startsWith('•') ? styles.dots : undefined}>{group}</span>
          ))}
        </span>
      </div>
      <div className={styles.bottom}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.label}>Available · {currency}</span>
            <span className={styles.amount}>{available}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.label}>Required</span>
            <span className={styles.numberValue}>{required}</span>
          </div>
        </div>
        <Image src={mark} alt="" width={28} height={28} className={styles.logo} />
      </div>
    </div>
  );
}
