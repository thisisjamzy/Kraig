'use client';

// Projects on the phone (Dreda v1.0 `Projects / Phone` 68782): "Projects"
// with "11 projects in 3 areas · 2 at risk", New project; Cards grouped by
// area, or Board grouped by stage (Planned, In progress, At risk, Done).
// The timeline has no phone frame yet (BUILD-KIT open question 5).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload } from 'lucide-react';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { plural, STAGE_ORDER, type ProjectStat } from '@/src/viewmodels/organise';
import type { LabelHue } from '@/src/viewmodels/projects';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HeaderButton, HeaderMenu, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { GroupHead, ProjectCard, ViewChips } from '@/src/phone/widgets/OrganiseCards/OrganiseCards';
import styles from '@/src/phone/screens/AllProjects/AllProjectsScreen.module.css';

type View = 'cards' | 'board';
const STAGE_HUE: Record<ProjectStat['stage'], LabelHue> = { Planned: 'grey', 'In progress': 'purple', 'At risk': 'orange', Done: 'green' };

export function AllProjectsScreen() {
  const router = useRouter();
  const o = useOrganise();
  const [view, setView] = useState<View>('cards');
  const live = o.projects.filter((p) => p.status === 'Active');
  const atRisk = live.filter((p) => p.health === 'At risk').length;
  const areas = new Set(live.map((p) => p.areaId).filter(Boolean)).size;

  const groups: { key: string; label: string; hue: LabelHue; projects: ProjectStat[] }[] =
    view === 'cards'
      ? [
          ...o.areas.map((a) => ({ key: a.id, label: a.name, hue: a.hue, projects: a.projects.filter((p) => p.status === 'Active') })),
          { key: 'none', label: 'No area', hue: 'grey' as const, projects: live.filter((p) => !p.areaId) },
        ]
      : STAGE_ORDER.map((s) => ({ key: s, label: s, hue: STAGE_HUE[s], projects: o.projects.filter((p) => p.stage === s && (s === 'Done' || p.status === 'Active')) }));

  return (
    <div className={styles.page}>
      <TimeHeader
        title="Projects"
        sub={`${plural(live.length, 'project')} in ${plural(areas, 'area')}${atRisk ? ` · ${atRisk} at risk` : ''}`}
        actions={
          <>
            <HeaderMenu label="Projects actions" items={[{ key: 'import', label: 'Import tasks', icon: <Upload size={16} strokeWidth={2} />, onSelect: () => router.push('/settings/import') }]} />
            <HeaderButton label="New project" onClick={() => router.push('/projects/new')}>
              <Plus size={20} strokeWidth={2} />
            </HeaderButton>
          </>
        }
      />
      <ViewChips<View>
        tabs={[
          { id: 'cards', label: 'Cards' },
          { id: 'board', label: 'Board' },
        ]}
        value={view}
        onChange={setView}
      />
      <ScreenState loading={o.loading} />
      {!o.loading && live.length === 0 && <p className={styles.empty}>No projects yet. Tap + to add one.</p>}
      {view === 'cards' &&
        groups
          .filter((g) => g.projects.length > 0)
          .map((g) => (
            <section key={g.key} className={styles.group} aria-label={g.label}>
              <GroupHead hue={g.hue} label={g.label} count={String(g.projects.length)} />
              {g.projects.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </section>
          ))}
      {view === 'board' && live.length + o.projects.filter((p) => p.stage === 'Done').length > 0 && (
        <div className={styles.board}>
          {groups.map((g) => (
            <section key={g.key} className={styles.boardColumn} aria-label={g.label}>
              <div className={styles.boardHead}>
                <GroupHead hue={g.hue} label={g.label} count={String(g.projects.length)} />
              </div>
              {g.projects.length === 0 ? <p className={styles.empty}>Nothing here</p> : g.projects.map((p) => <ProjectCard key={p.id} p={p} />)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
