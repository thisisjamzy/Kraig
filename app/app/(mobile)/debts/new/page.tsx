import type { Metadata } from 'next';
import { NewDebtRoute } from '@/src/routes/DebtForms/DebtFormRoutes';

export const metadata: Metadata = {
  title: 'New debt · Dreda',
};

// Phones: the phone line's New debt page. Wider screens: the web form (it
// usually opens as a side peek instead, src/shared/navigation/debtForms.ts).
export default function NewDebtPage() {
  return <NewDebtRoute />;
}
