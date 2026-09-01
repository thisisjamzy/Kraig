import type { Metadata } from 'next';
import { CategoriesScreen } from '@/src/screens/Categories/CategoriesScreen';

export const metadata: Metadata = {
  title: 'Categories · Dreda',
};

export default function CategoriesPage() {
  return <CategoriesScreen />;
}
