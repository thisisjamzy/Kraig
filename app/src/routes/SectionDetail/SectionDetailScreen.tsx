'use client';

// A folder (stored as a section). Phone: its own screen. Tablet and web: the
// folder scope of the shared area and folder page (Dreda.figcraft `Folder /
// Web`), loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { SectionDetailScreen as PhoneSectionDetailScreen } from '@/src/screens/SectionDetail/SectionDetailScreen';

const WebFolderScreen = dynamic(() => import('@/src/screens/WorkScope/WorkScopeScreen').then((m) => m.WorkScopeScreen), { ssr: false });

export function SectionDetailScreen({ bucketId }: { bucketId: string }) {
  return <DeviceSplit phone={<PhoneSectionDetailScreen bucketId={bucketId} />} web={<WebFolderScreen kind="folder" folderId={bucketId} />} />;
}
