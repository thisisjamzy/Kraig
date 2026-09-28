import type { Metadata } from 'next';
import { CalendarEventDetailScreen } from '@/src/screens/CalendarEventDetail/CalendarEventDetailScreen';

export const metadata: Metadata = {
  title: 'Calendar event · Dreda',
};

export default async function CalendarEventPage({ params }: PageProps<'/projects/calendar/events/[eventId]'>) {
  const { eventId } = await params;
  return <CalendarEventDetailScreen eventId={decodeURIComponent(eventId)} />;
}
