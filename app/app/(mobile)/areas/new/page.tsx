import type { Metadata } from 'next';
import { CreateAreaScreen } from '@/src/screens/CreateArea/CreateAreaScreen';

export const metadata: Metadata = {
  title: 'New area · Dreda',
};

export default function CreateAreaPage() {
  return <CreateAreaScreen />;
}
