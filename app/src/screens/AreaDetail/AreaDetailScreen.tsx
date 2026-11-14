'use client';

// An area on tablet and web: the area scope of the shared area and folder
// page (src/screens/WorkScope, Dreda.figcraft `Area / Web`).

import { WorkScopeScreen } from '@/src/screens/WorkScope/WorkScopeScreen';

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  return <WorkScopeScreen kind="area" areaId={areaId} />;
}
