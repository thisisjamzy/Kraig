'use client';

// Areas on the phone (Dreda v1.0 `Areas / Phone` 68990): "Areas" with
// "3 areas, 5 folders, 11 projects", New area; a card per area with its
// counts, progress and folders.

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { plural } from '@/src/viewmodels/organise';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HeaderButton, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { AreaCard } from '@/src/phone/widgets/OrganiseCards/OrganiseCards';
import styles from '@/src/phone/screens/AllProjects/AllProjectsScreen.module.css';

export function AllAreasScreen() {
  const router = useRouter();
  const o = useOrganise();
  const folders = o.folders.length;
  const projects = o.projects.filter((p) => p.status === 'Active').length;
  return (
    <div className={styles.page}>
      <TimeHeader
        title="Areas"
        sub={`${plural(o.areas.length, 'area')}, ${plural(folders, 'folder')}, ${plural(projects, 'project')}`}
        actions={
          <HeaderButton label="New area" onClick={() => router.push('/areas/new')}>
            <Plus size={20} strokeWidth={2} />
          </HeaderButton>
        }
      />
      <ScreenState loading={o.loading} />
      {!o.loading && o.areas.length === 0 && <p className={styles.empty}>No areas yet. Tap + to add one.</p>}
      {o.areas.map((a) => (
        <AreaCard key={a.id} a={a} />
      ))}
    </div>
  );
}
