import type { Metadata } from 'next';
import { MonthReviewScreen } from '@/src/routes/MonthReview/MonthReviewScreen';

export const metadata: Metadata = {
  title: 'Review the month · Dreda',
};

export default function MonthReviewPage() {
  return <MonthReviewScreen />;
}
