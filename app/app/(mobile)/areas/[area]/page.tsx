import type { Metadata } from 'next';
import { AreaDetailScreen } from '@/src/screens/AreaDetail/AreaDetailScreen';

export const metadata: Metadata = {
  title: 'Area · Dreda',
};

export default async function AreaDetailPage({ params }: PageProps<'/areas/[area]'>) {
  const { area } = await params;
  return <AreaDetailScreen areaId={decodeURIComponent(area)} />;
}
