import type { Metadata } from 'next';
import { CreateCategoryScreen } from '@/src/screens/CreateCategory/CreateCategoryScreen';

export const metadata: Metadata = {
  title: 'Create category · Dreda',
};

export default function CreateCategoryPage() {
  return <CreateCategoryScreen />;
}
