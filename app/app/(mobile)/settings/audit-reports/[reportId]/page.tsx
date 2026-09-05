import type { Metadata } from 'next';
import { AuditReportDetailScreen } from '@/src/screens/AuditReportDetail/AuditReportDetailScreen';

export const metadata: Metadata = {
  title: 'Audit report · Dreda',
};

export default async function AuditReportDetailPage({ params }: PageProps<'/settings/audit-reports/[reportId]'>) {
  const { reportId } = await params;
  return <AuditReportDetailScreen reportId={decodeURIComponent(reportId)} />;
}
