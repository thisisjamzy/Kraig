import type { Metadata } from 'next';
import { DebtFormScreen } from '@/src/screens/DebtForms/DebtFormScreen';

export const metadata: Metadata = {
  title: 'New debt · Dreda',
};

// The full page a phone opens; wider screens open the same form as a side
// peek over the current page (src/shared/navigation/debtForms.ts).
export default function NewDebtPage() {
  return <DebtFormScreen debtId={null} />;
}
