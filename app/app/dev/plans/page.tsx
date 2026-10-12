import { notFound } from 'next/navigation';
import { PlanPreview } from './PlanPreview';

// Development only: the money and time plans on the prototype's sample data
// (src/viewmodels/planner/fixtures.ts), to check layouts without signing in.
// ?p=money|time&web=1&h=1w|4w|3m|6m&change=1 (moves the concert ticket).
export default async function PlanPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  return <PlanPreview which={params.p === 'time' ? 'time' : 'money'} web={params.web === '1'} horizon={params.h} change={params.change === '1'} board={params.view === 'board'} />;
}
