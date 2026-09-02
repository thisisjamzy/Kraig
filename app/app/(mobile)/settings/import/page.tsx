import type { Metadata } from 'next';
import { ImportCsvScreen } from '@/src/screens/ImportCsv/ImportCsvScreen';

export const metadata: Metadata = {
  title: 'Import transactions · Dreda',
};

export default function ImportCsvPage() {
  return <ImportCsvScreen />;
}
