import type { Metadata } from 'next';
import { PersonScreen } from '@/src/routes/People/PeopleScreen';

export const metadata: Metadata = {
  title: 'Person · Dreda',
};

export default async function PersonPage({ params }: { params: Promise<{ person: string }> }) {
  const { person } = await params;
  return <PersonScreen personId={decodeURIComponent(person)} />;
}
