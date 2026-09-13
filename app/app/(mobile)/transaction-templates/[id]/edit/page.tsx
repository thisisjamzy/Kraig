import type { Metadata } from 'next';
import { CreateTransactionTemplateScreen } from '@/src/screens/CreateTransactionTemplate/CreateTransactionTemplateScreen';

export const metadata: Metadata = {
  title: 'Edit template · Dreda',
};

export default async function EditTransactionTemplatePage({ params }: PageProps<'/transaction-templates/[id]/edit'>) {
  const { id } = await params;
  return <CreateTransactionTemplateScreen templateId={decodeURIComponent(id)} />;
}
