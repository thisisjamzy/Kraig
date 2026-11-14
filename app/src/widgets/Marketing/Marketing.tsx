'use client';

// The landing page's own pieces (Design-System BUILD-KIT section 4, allowed
// new components): the dark hero panel, the pill button, the eyebrow pill,
// the accent panel and the phone mock frame. Used by screens/Marketing only.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ListOrdered, Plus, RefreshCw } from 'lucide-react';
import { Logo } from '@/src/widgets/Logo/Logo';
import s from './Marketing.module.css';

export function HeroPanel({ children }: { children: ReactNode }) {
  return (
    <section className={s.hero}>
      <span className={s.blobPurple} aria-hidden />
      <span className={s.blobLime} aria-hidden />
      <div className={s.heroInner}>{children}</div>
    </section>
  );
}

type PillTone = 'accent' | 'outline' | 'ink' | 'brand';

export function PillButton({ href, onClick, tone = 'accent', type = 'button', children }: { href?: string; onClick?: () => void; tone?: PillTone; type?: 'button' | 'submit'; children: ReactNode }) {
  if (href) {
    return (
      <Link href={href} className={s.pill} data-tone={tone}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={s.pill} data-tone={tone} onClick={onClick}>
      {children}
    </button>
  );
}

export function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' | 'accent' }) {
  return (
    <span className={s.eyebrow} data-tone={tone}>
      {children}
    </span>
  );
}

export function AccentPanel({ children }: { children: ReactNode }) {
  return <section className={s.accentPanel}>{children}</section>;
}

/** A phone drawn in CSS showing the app's home: safe to spend, quick actions, two baskets. */
export function PhoneMock({ children }: { children?: ReactNode }) {
  const baskets = [
    { name: 'Transport', meta: 'Variable · Cash', amount: '22,500', of: 'of 30,000', left: '7,500 left', fill: 75 },
    { name: 'Food and groceries', meta: 'Variable · MTN MoMo', amount: '45,000', of: 'of 60,000', left: '15,000 left', fill: 75 },
  ];
  return (
    <div className={s.phone} aria-hidden>
      <div className={s.phoneScreen}>
        <div className={s.phoneTop}>
          <Logo height={24} />
          <span className={s.phoneAvatar} />
        </div>
        <div className={s.safe}>
          <span>Safe to spend today</span>
          <strong>18,400</strong>
        </div>
        <div className={s.quick}>
          {[Plus, ListOrdered, ArrowLeftRight, RefreshCw].map((Icon, i) => (
            <span key={i}>
              <Icon size={16} strokeWidth={2} />
            </span>
          ))}
        </div>
        <span className={s.phoneLabel}>Baskets</span>
        <div className={s.baskets}>
          {baskets.map((b) => (
            <div key={b.name} className={s.basket}>
              <div className={s.basketHead}>
                <span>
                  <strong>{b.name}</strong>
                  <small>{b.meta}</small>
                </span>
                <span className={s.basketAmount}>
                  <strong>{b.amount}</strong>
                  <small>{b.of}</small>
                </span>
              </div>
              <span className={s.basketBar}>
                <span style={{ width: `${b.fill}%` }} />
              </span>
              <span className={s.basketLeft}>{b.left}</span>
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

/** A small white card that floats over the phone mock. */
export function FloatCard({ position, children }: { position: 'top' | 'bottom'; children: ReactNode }) {
  return (
    <div className={s.float} data-position={position}>
      {children}
    </div>
  );
}
