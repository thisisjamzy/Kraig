import type { Metadata } from 'next';
import { NewLinkScreen } from '@/src/routes/SchedulingLinks/NewLinkScreen';

export const metadata: Metadata = {
  title: 'New scheduling link · Dreda',
};

export default function NewLinkPage() {
  return <NewLinkScreen />;
}
