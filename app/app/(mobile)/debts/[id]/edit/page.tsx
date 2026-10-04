import type { Metadata } from 'next';
import { EditDebtRoute } from '@/src/routes/DebtForms/DebtFormRoutes';

export const metadata: Metadata = {
  title: 'Edit debt · Dreda',
};

export default async function EditDebtPage({ params }: PageProps<'/debts/[id]/edit'>) {
  const { id } = await params;
  return <EditDebtRoute debtId={decodeURIComponent(id)} />;
}
