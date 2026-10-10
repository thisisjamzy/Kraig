import type { Metadata } from 'next';
import { ItemKindReviewScreen } from '@/src/routes/ItemKindReview/ItemKindReviewScreen';

export const metadata: Metadata = {
  title: 'Check your items · Dreda',
};

export default function ItemKindReviewPage() {
  return <ItemKindReviewScreen />;
}
