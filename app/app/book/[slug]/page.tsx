import type { Metadata } from 'next';
import { PublicBookingScreen } from '@/src/routes/PublicBooking/PublicBookingScreen';

// A booking page people open from a scheduling link: outside the app's
// (mobile) group, so no app chrome, and open without signing in (proxy.ts).

export const metadata: Metadata = {
  title: 'Book a time · Dreda',
};

export default async function PublicBookingPage({ params }: PageProps<'/book/[slug]'>) {
  const { slug } = await params;
  return <PublicBookingScreen slug={decodeURIComponent(slug)} />;
}
