'use client';

// Insights level one, "Worth doing now" (Dreda.figcraft `Insights / Web`):
// a finding, the number that proves it, and a button into the screen that
// fixes it. The tone sets the border and badge: danger, warning or brand.

import Link from 'next/link';
import { HandCoins, RefreshCw, WalletCards, type LucideIcon } from 'lucide-react';
import type { ActionCard as ActionCardData, ActionKind } from '@/src/viewmodels/dashboard/verdict';
import s from './Insights.module.css';

const ICON: Record<ActionKind, LucideIcon> = { untracked: RefreshCw, unplanned: WalletCards, debts: HandCoins };

export function ActionCard({ card }: { card: ActionCardData }) {
  const Icon = ICON[card.kind];
  return (
    <article className={s.action} data-tone={card.tone}>
      <span className={s.badge} aria-hidden>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <h3 className={s.actionTitle}>{card.title}</h3>
      <p className={s.actionBody}>{card.body}</p>
      <Link href={card.href} className={s.actionButton}>
        {card.action}
      </Link>
    </article>
  );
}
