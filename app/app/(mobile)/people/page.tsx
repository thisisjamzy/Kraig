import type { Metadata } from 'next';
import { PeopleScreen } from '@/src/routes/People/PeopleScreen';

export const metadata: Metadata = {
  title: 'People · Dreda',
};

export default function PeoplePage() {
  return <PeopleScreen />;
}
