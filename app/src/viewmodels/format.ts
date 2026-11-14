import { maskAmount } from '@/src/shared/hooks/usePrivacy';

// Plain thousands-separated amounts ("1,013,381"), shared by the bucket screens.
export function formatAmount(value: number) {
  return maskAmount(new Intl.NumberFormat('en-US').format(value));
}
