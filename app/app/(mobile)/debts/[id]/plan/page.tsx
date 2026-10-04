import type { Metadata } from 'next';
import { DebtPlanRoute } from '@/src/routes/DebtForms/DebtFormRoutes';

export const metadata: Metadata = {
  title: 'Edit payment plan · Dreda',
};

export default async function EditDebtPlanPage({ params }: PageProps<'/debts/[id]/plan'>) {
  const { id } = await params;
  return <DebtPlanRoute debtId={decodeURIComponent(id)} />;
}
