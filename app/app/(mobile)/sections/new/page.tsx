import type { Metadata } from 'next';
import { CreateSectionScreen } from '@/src/screens/CreateSection/CreateSectionScreen';

export const metadata: Metadata = {
  title: 'New section · Dreda',
};

// areaId comes in as a real prop from Next's own parsed searchParams, not a
// client-side window.location.search read (every other create/edit screen's
// own convention, see e.g. src/logic/projectForm/useLogic.ts) — this one
// screen has no fallback UI for a missing area (sections.ts always splits
// section:area 1:1, unlike a project's optional area), so it can't tolerate
// the one real gap in that convention: navigating client-side between two
// visits of this same route (a different area's own "New section" link each
// time) doesn't force the page component to remount, so a value seeded once
// via useState's lazy initializer can go stale on the second visit. A prop
// straight from Next's router re-renders with every navigation, stale or
// not.
export default async function CreateSectionPage({ searchParams }: PageProps<'/sections/new'>) {
  const params = await searchParams;
  const areaIdParam = params.areaId;
  const areaId = Array.isArray(areaIdParam) ? areaIdParam[0] : areaIdParam;
  return <CreateSectionScreen areaId={areaId ?? ''} />;
}
