import type { Metadata } from 'next';
import { ImportDataScreen } from '@/src/screens/ImportData/ImportDataScreen';

export const metadata: Metadata = {
  title: 'Import data · Dreda',
};

export default function ImportDataPage() {
  return <ImportDataScreen />;
}
