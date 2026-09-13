import type { Metadata } from 'next';
import { ArchivedGoalsScreen } from '@/src/screens/ArchivedGoals/ArchivedGoalsScreen';

export const metadata: Metadata = {
  title: 'Archived goals · Dreda',
};

export default function ArchivedGoalsPage() {
  return <ArchivedGoalsScreen />;
}
