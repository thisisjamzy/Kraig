import type { Metadata } from 'next';
import { MigrationReportScreen } from '@/src/screens/MigrationReport/MigrationReportScreen';

export const metadata: Metadata = {
  title: 'What changed · Dreda',
};

export default function MigrationReportPage() {
  return <MigrationReportScreen />;
}
