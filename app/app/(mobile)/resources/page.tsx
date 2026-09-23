import type { Metadata } from 'next';
import { ComingSoonScreen } from '@/src/screens/ComingSoon/ComingSoonScreen';

export const metadata: Metadata = {
  title: 'Resources · Dreda',
};

export default function ResourcesPage() {
  return <ComingSoonScreen title="Resources" message="Resources is coming soon." icon="book-open" />;
}
