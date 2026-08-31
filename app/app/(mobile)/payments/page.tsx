import type { Metadata } from 'next';
import { PaymentsCalendarScreen } from '@/src/screens/PaymentsCalendar/PaymentsCalendarScreen';

export const metadata: Metadata = {
  title: 'Payments Calendar · Dreda',
};

export default function PaymentsPage() {
  return <PaymentsCalendarScreen />;
}
