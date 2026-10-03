'use client';

// An amount, formatted ("1,013,381", "+250,000 XAF"), or "••••••" while
// amounts are hidden (src/shared/hooks/usePrivacy.ts). Never truncated.

import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';

export function formatMoney(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function Money({
  value,
  currency,
  sign = false,
  className,
}: {
  value: number;
  currency?: string;
  /** Show "+" for positive and "−" for negative amounts. */
  sign?: boolean;
  className?: string;
}) {
  const [hidden] = useAmountsHidden();
  if (hidden) return <span className={className} aria-label="Amount hidden">{HIDDEN_AMOUNT}</span>;
  const prefix = sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : '';
  return (
    <span className={className} style={{ whiteSpace: 'nowrap' }}>
      {prefix}
      {formatMoney(Math.abs(value))}
      {currency ? ` ${currency}` : ''}
    </span>
  );
}
