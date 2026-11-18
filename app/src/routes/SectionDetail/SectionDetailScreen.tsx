'use client';

// A folder (stored as a section): the folder scope of the shared area and
// folder screen. Phone: src/phone/screens/Scope; tablet and web:
// src/screens/WorkScope, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { ScopeScreen } from '@/src/phone/screens/Scope/ScopeScreen';

const WebFolderScreen = dynamic(() => import('@/src/screens/WorkScope/WorkScopeScreen').then((m) => m.WorkScopeScreen), { ssr: false });

export function SectionDetailScreen({ bucketId }: { bucketId: string }) {
  return <DeviceSplit phone={<ScopeScreen kind="folder" folderId={bucketId} />} web={<WebFolderScreen kind="folder" folderId={bucketId} />} />;
}
