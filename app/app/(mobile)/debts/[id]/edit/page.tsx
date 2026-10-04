import type { Metadata } from 'next';
import { DebtFormScreen } from '@/src/screens/DebtForms/DebtFormScreen';

export const metadata: Metadata = {
  title: 'Edit debt · Dreda',
};

export default async function EditDebtPage({ params }: PageProps<'/debts/[id]/edit'>) {
  const { id } = await params;
  return <DebtFormScreen debtId={decodeURIComponent(id)} />;
}
