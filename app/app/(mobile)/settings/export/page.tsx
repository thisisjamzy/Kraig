import type { Metadata } from 'next';
import { ExportDataScreen } from '@/src/screens/ExportData/ExportDataScreen';

export const metadata: Metadata = {
  title: 'Export data · Dreda',
};

export default function ExportDataPage() {
  return <ExportDataScreen />;
}
