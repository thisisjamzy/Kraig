import type { Metadata } from 'next';
import { FoldersScreen } from '@/src/routes/Folders/FoldersScreen';

export const metadata: Metadata = {
  title: 'Folders · Dreda',
};

export default function FoldersPage() {
  return <FoldersScreen />;
}
