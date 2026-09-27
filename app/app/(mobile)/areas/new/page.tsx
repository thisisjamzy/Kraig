import type { Metadata } from 'next';
import { AreaFormScreen } from '@/src/screens/AreaForm/AreaFormScreen';

export const metadata: Metadata = {
  title: 'New area · Dreda',
};

export default function CreateAreaPage() {
  return <AreaFormScreen />;
}
