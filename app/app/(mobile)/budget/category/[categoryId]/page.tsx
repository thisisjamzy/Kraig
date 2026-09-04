import type { Metadata } from 'next';
import { CategoryTransactionsScreen } from '@/src/screens/CategoryTransactions/CategoryTransactionsScreen';

export const metadata: Metadata = {
  title: 'Category · Dreda',
};

export default async function CategoryTransactionsPage({ params }: PageProps<'/budget/category/[categoryId]'>) {
  const { categoryId } = await params;
  return <CategoryTransactionsScreen categoryId={decodeURIComponent(categoryId)} />;
}
