import type { Metadata } from 'next';
import { BreakdownRedirect } from './BreakdownRedirect';

export const metadata: Metadata = {
  title: 'Insights · Dreda',
};

// The full breakdown is part of Insights now (owner, 24 Nov 2026): this
// address forwards to /statistics, keeping a #section if one was given.
export default function MoneyBreakdownPage() {
  return <BreakdownRedirect />;
}
