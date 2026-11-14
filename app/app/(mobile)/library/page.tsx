import type { Metadata } from 'next';
import { LibraryScreen } from '@/src/routes/Library/LibraryScreen';

export const metadata: Metadata = {
  title: 'Library · Dreda',
};

export default function LibraryPage() {
  return <LibraryScreen />;
}
