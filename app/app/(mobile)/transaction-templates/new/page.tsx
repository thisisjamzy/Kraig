import type { Metadata } from 'next';
import { CreateTransactionTemplateScreen } from '@/src/screens/CreateTransactionTemplate/CreateTransactionTemplateScreen';

export const metadata: Metadata = {
  title: 'New template · Dreda',
};

export default function NewTransactionTemplatePage() {
  return <CreateTransactionTemplateScreen />;
}
