import type { Metadata } from 'next';
import { PersonNewScreen } from '@/src/routes/People/PeopleScreen';

export const metadata: Metadata = {
  title: 'Add someone · Dreda',
};

export default function PersonNewPage() {
  return <PersonNewScreen />;
}
