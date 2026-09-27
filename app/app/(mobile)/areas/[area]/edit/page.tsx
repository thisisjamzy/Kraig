import type { Metadata } from 'next';
import { AreaFormScreen } from '@/src/screens/AreaForm/AreaFormScreen';

export const metadata: Metadata = {
  title: 'Edit area · Dreda',
};

export default async function AreaEditPage({ params }: PageProps<'/areas/[area]/edit'>) {
  const { area } = await params;
  // The same form as New area, in edit mode.
  return <AreaFormScreen areaId={decodeURIComponent(area)} />;
}
