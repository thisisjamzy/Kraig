import type { Metadata } from 'next';
import { AreaEditScreen } from '@/src/screens/AreaEdit/AreaEditScreen';

export const metadata: Metadata = {
  title: 'Edit area · Dreda',
};

export default async function AreaEditPage({ params }: PageProps<'/areas/[area]/edit'>) {
  const { area } = await params;
  return <AreaEditScreen areaId={decodeURIComponent(area)} />;
}
