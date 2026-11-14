import type { Metadata } from 'next';
import { SectionDetailScreen } from '@/src/routes/SectionDetail/SectionDetailScreen';

export const metadata: Metadata = {
  title: 'Folder · Dreda',
};

export default async function SectionDetailPage({ params }: PageProps<'/sections/[section]'>) {
  const { section } = await params;
  return <SectionDetailScreen bucketId={decodeURIComponent(section)} />;
}
