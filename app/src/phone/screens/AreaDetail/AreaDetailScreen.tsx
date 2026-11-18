'use client';

// An area on the phone: the area scope of the shared area and folder
// screen (src/phone/screens/Scope, Dreda v1.0 `Area detail / Phone` 69829).

import { ScopeScreen } from '@/src/phone/screens/Scope/ScopeScreen';

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  return <ScopeScreen kind="area" areaId={areaId} />;
}
