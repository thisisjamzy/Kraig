import type { Metadata } from 'next';
import { CategoryEditScreen } from '@/src/screens/CategoryEdit/CategoryEditScreen';

export const metadata: Metadata = {
  title: 'Edit category · Dreda',
};

export default async function CategoryEditPage({ params }: PageProps<'/categories/[category]/edit'>) {
  const { category } = await params;
  return <CategoryEditScreen categoryId={decodeURIComponent(category)} />;
}
