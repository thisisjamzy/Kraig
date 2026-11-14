import type { Metadata } from 'next';
import { SchedulingLinksScreen } from '@/src/routes/SchedulingLinks/SchedulingLinksScreen';

export const metadata: Metadata = {
  title: 'Scheduling links · Dreda',
};

export default function SchedulingLinksPage() {
  return <SchedulingLinksScreen />;
}
