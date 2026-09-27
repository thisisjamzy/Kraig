import type { Metadata } from 'next';
import { SectionDetailScreen } from '@/src/screens/SectionDetail/SectionDetailScreen';

export const metadata: Metadata = {
  title: 'Section · Dreda',
};

export default async function SectionDetailPage({ params }: PageProps<'/sections/[section]'>) {
  const { section } = await params;
  return <SectionDetailScreen bucketId={decodeURIComponent(section)} />;
}
