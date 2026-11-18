'use client';

// Folders on the phone (Dreda v1.0 `Folders / Phone` 69139): "Folders"
// with "5 folders across 3 areas", New folder; folder cards grouped by
// area.

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { plural } from '@/src/viewmodels/organise';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HeaderButton, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { FolderCard, GroupHead } from '@/src/phone/widgets/OrganiseCards/OrganiseCards';
import styles from '@/src/phone/screens/AllProjects/AllProjectsScreen.module.css';

export function FoldersScreen() {
  const router = useRouter();
  const o = useOrganise();
  const areas = o.areas.map((a) => ({ a, folders: a.folders })).filter((x) => x.folders.length > 0);
  const count = areas.reduce((s, x) => s + x.folders.length, 0);
  return (
    <div className={styles.page}>
      <TimeHeader
        title="Folders"
        sub={`${plural(count, 'folder')} across ${plural(areas.length, 'area')}`}
        actions={
          <HeaderButton label="New folder" onClick={() => router.push('/sections/new')}>
            <Plus size={20} strokeWidth={2} />
          </HeaderButton>
        }
      />
      <ScreenState loading={o.loading} />
      {!o.loading && count === 0 && <p className={styles.empty}>No folders yet. Tap + to add one.</p>}
      {areas.map(({ a, folders }) => (
        <section key={a.id} className={styles.group} aria-label={a.name}>
          <GroupHead hue={a.hue} label={a.name} count={plural(folders.length, 'folder')} />
          {folders.map((f) => (
            <FolderCard key={f.id} f={f} />
          ))}
        </section>
      ))}
    </div>
  );
}
