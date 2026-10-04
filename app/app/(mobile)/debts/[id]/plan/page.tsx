import type { Metadata } from 'next';
import { PlanFormScreen } from '@/src/screens/DebtForms/PlanFormScreen';

export const metadata: Metadata = {
  title: 'Edit payment plan · Dreda',
};

export default async function EditDebtPlanPage({ params }: PageProps<'/debts/[id]/plan'>) {
  const { id } = await params;
  return <PlanFormScreen debtId={decodeURIComponent(id)} />;
}
