import type { Metadata } from 'next';
import { AuditReportsScreen } from '@/src/screens/AuditReports/AuditReportsScreen';

export const metadata: Metadata = {
  title: 'Financial audit reports · Dreda',
};

export default function AuditReportsPage() {
  return <AuditReportsScreen />;
}
