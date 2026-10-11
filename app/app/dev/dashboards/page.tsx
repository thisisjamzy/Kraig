import { notFound } from 'next/navigation';
import { DashboardPreview } from './DashboardPreview';

// Development only: both dashboards on sample data (src/viewmodels/dashboard/
// fixtures.ts), to check layouts at any width without signing in.
export default async function DashboardPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  return <DashboardPreview which={params.d === 'time' ? 'time' : 'money'} initial={params.period} web={params.web === '1'} />;
}
