'use client';

// An area or a folder on the phone (Dreda v1.0 `Area detail / Phone`
// 69829, `Folder detail / Phone` 69318).
//   Area: back to Areas, "2 folders · 4 projects · 26 open", its brief;
//   Folders (cards with their projects) or Tasks.
//   Folder: back to its area, "Work · 3 projects · 19 open"; Projects (cards
//   with their brief, then Next up) or Tasks.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Plus, Trash2, Upload } from 'lucide-react';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { DeletePlaceDialog } from '@/src/widgets/DeletePlaceDialog/DeletePlaceDialog';
import { useLogic, type Scope } from '@/src/logic/workScope/useLogic';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { plural } from '@/src/viewmodels/organise';
import { labelHue } from '@/src/viewmodels/projects';
import { durationText } from '@/src/viewmodels/todayPlan';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HueTag, TypePill } from '@/src/widgets/TaskChips/TypePill';
import { HeaderButton, HeaderMenu, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { TaskLine } from '@/src/phone/widgets/TaskCheckRow/TaskLine';
import { FolderCard, GroupHead, NextUpList, ProjectCard, ViewChips } from '@/src/phone/widgets/OrganiseCards/OrganiseCards';
import styles from '@/src/phone/screens/AllProjects/AllProjectsScreen.module.css';

type View = 'main' | 'tasks';

export function ScopeScreen(props: Scope) {
  const router = useRouter();
  const taskPanel = useTaskPanel();
  const v = useLogic(props);
  const [view, setView] = useState<View>('main');
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isArea = props.kind === 'area';
  const scope = isArea ? v.area : v.folder;

  if (v.loading) return <ScreenState loading />;
  if (!scope || !v.area) return <ScreenState error={`This ${isArea ? 'area' : 'folder'} no longer exists.`} />;

  const area = v.area;
  const folders = area.folders;
  const open = v.tasks.filter((t) => t.status === 'pending');
  const sub = isArea
    ? `${plural(folders.length, 'folder')} · ${plural(v.projects.length, 'project')} · ${scope.open} open`
    : `${area.name} · ${plural(v.projects.length, 'project')} · ${scope.open} open`;

  return (
    <div className={styles.page}>
      <TimeHeader
        title={scope.name}
        sub={sub}
        crumb={isArea ? { label: 'Areas', href: '/areas' } : { label: area.name, href: `/areas/${area.id}` }}
        actions={
          <>
            <HeaderMenu
              label={isArea ? 'Area actions' : 'Folder actions'}
              items={[
                { key: 'import', label: 'Import tasks', icon: <Upload size={16} strokeWidth={2} />, onSelect: () => router.push(`/settings/import?area=${encodeURIComponent(area.id)}`) },
                { key: 'archive', label: isArea ? 'Archive area' : 'Archive folder', icon: <Archive size={16} strokeWidth={2} />, onSelect: () => setArchiving(true), danger: true, divider: true },
                ...(v.deletable ? [{ key: 'delete', label: isArea ? 'Delete area' : 'Delete folder', icon: <Trash2 size={16} strokeWidth={2} />, onSelect: () => setDeleting(true), danger: true }] : []),
              ]}
            />
            <HeaderButton
              label={isArea ? 'New folder' : 'New project'}
              onClick={() => router.push(isArea ? `/sections/new?areaId=${area.id}` : `/projects/new?areaId=${area.id}&bucketId=${scope.id}`)}
            >
              <Plus size={20} strokeWidth={2} />
            </HeaderButton>
          </>
        }
      />
      {archiving && (
        <ConfirmDialog
          tone="neutral"
          title={`Archive ${scope.name}?`}
          message="It moves to the Archive in Library. Restore it from there any time."
          confirmLabel="Archive"
          cancelLabel="Cancel"
          onCancel={() => setArchiving(false)}
          onConfirm={() => void v.archive()}
        />
      )}
      {deleting && v.deletable && <DeletePlaceDialog place={v.deletable} onCancel={() => setDeleting(false)} onDeleted={v.leave} />}
      {isArea && scope.description && <p className={styles.lead}>{scope.description}</p>}
      <ViewChips<View>
        tabs={[
          { id: 'main', label: isArea ? 'Folders' : 'Projects' },
          { id: 'tasks', label: 'Tasks' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'main' ? (
        isArea ? (
          folders.length ? (
            folders.map((f) => <FolderCard key={f.id} f={f} />)
          ) : (
            <p className={styles.empty}>No folders yet. Tap + to add one.</p>
          )
        ) : (
          <>
            {v.projects.length ? v.projects.map((p) => <ProjectCard key={p.id} p={p} brief />) : <p className={styles.empty}>No projects here yet. Tap + to add one.</p>}
            {open.length > 0 && (
              <section className={styles.group} aria-label="Next up">
                <GroupHead hue="purple" label="Next up" count={plural(Math.min(open.length, 5), 'task')} />
                <NextUpList items={open.slice(0, 5).map((t) => ({ id: t.id, title: t.title, date: t.dueDate ?? t.startTime, projectId: t.projectId, overdue: t.late }))} projects={v.projects} />
              </section>
            )}
          </>
        )
      ) : v.tasks.length === 0 ? (
        <p className={styles.empty}>Nothing open here.</p>
      ) : (
        <section className={styles.card} aria-label="Tasks">
          {v.tasks.map((t) => {
            const done = t.status === 'done';
            return (
              <TaskLine
                key={t.id}
                title={t.title}
                done={done}
                onToggle={() => void v.setDone(t, !done)}
                onOpen={() => taskPanel.open(t.id)}
                right={t.late ? t.dueText : t.minutes > 0 ? durationText(t.minutes) : t.dueText}
                late={t.late}
                tags={
                  <>
                    {t.projectName && <HueTag hue={labelHue(t.projectColor)}>{t.projectName}</HueTag>}
                    {!done && <TypePill type={t.typeName} />}
                    {t.blockText && <span>{t.blockText}</span>}
                  </>
                }
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
