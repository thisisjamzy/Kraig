'use client';

// A project on the phone (Dreda v1.0 `Project detail / Phone` 69552):
// back to its folder (else its area), the name, "Dreda app · 7 open · 63%
// done", Edit and New task; Tasks (a summary of progress, open tasks, due
// and time blocked, then its tasks), Board (its tasks by status) or Notes
// (written in place).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ChartColumn, Pencil, Plus, Upload } from 'lucide-react';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { useLogic } from '@/src/logic/projectDetail/useLogic';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { durationText } from '@/src/viewmodels/todayPlan';
import type { TaskListItem } from '@/src/viewmodels/taskListItem';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TypePill } from '@/src/widgets/TaskChips/TypePill';
import { HeaderMenu, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { TaskLine } from '@/src/phone/widgets/TaskCheckRow/TaskLine';
import { ViewChips } from '@/src/phone/widgets/OrganiseCards/OrganiseCards';
import styles from '@/src/phone/screens/AllProjects/AllProjectsScreen.module.css';

type View = 'tasks' | 'board' | 'notes';
const BOARD = ['To do', 'In progress', 'Waiting', 'In review', 'Done'];

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const v = useLogic(projectId);
  const [view, setView] = useState<View>('tasks');
  const [draft, setDraft] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const { row, stat } = v;

  if (v.loading) return <ScreenState loading />;
  if (!row || !stat) return <ScreenState error="This project no longer exists." />;

  const crumb = stat.folderId && stat.folderName ? { label: stat.folderName, href: `/sections/${stat.folderId}` } : stat.areaId ? { label: stat.areaName ?? 'Area', href: `/areas/${stat.areaId}` } : { label: 'Projects', href: '/projects/all' };
  const open = v.tasks.filter((t) => t.status === 'pending');
  const done = v.tasks.filter((t) => t.status === 'done');
  const notes = draft ?? v.notes;
  const newTaskHref = `/tasks/new?projectId=${encodeURIComponent(projectId)}`;

  return (
    <div className={styles.page}>
      <TimeHeader
        title={row.name}
        sub={[stat.folderName ?? stat.areaName, `${stat.open} open`, `${Math.round(stat.progress * 100)}% done`].filter(Boolean).join(' · ')}
        crumb={crumb}
        actions={
          <HeaderMenu
            label="Project actions"
            items={[
              { key: 'new', label: 'New task', icon: <Plus size={16} strokeWidth={2} />, onSelect: () => router.push(newTaskHref) },
              { key: 'edit', label: 'Edit project', icon: <Pencil size={16} strokeWidth={2} />, onSelect: () => router.push(`/projects/${projectId}/edit`) },
              { key: 'import', label: 'Import tasks', icon: <Upload size={16} strokeWidth={2} />, onSelect: () => router.push(`/settings/import?project=${encodeURIComponent(projectId)}`) },
              { key: 'insights', label: 'Project insights', icon: <ChartColumn size={16} strokeWidth={2} />, onSelect: () => router.push(`/projects/insights/${projectId}`) },
              { key: 'archive', label: 'Archive project', icon: <Archive size={16} strokeWidth={2} />, onSelect: () => setArchiving(true), danger: true, divider: true },
            ]}
          />
        }
      />
      {archiving && (
        <ConfirmDialog
          tone="neutral"
          title={`Archive ${row.name}?`}
          message="It moves to the Archive in Library with all its tasks. Restore it from there any time."
          confirmLabel="Archive"
          cancelLabel="Cancel"
          onCancel={() => setArchiving(false)}
          onConfirm={() => void v.archive()}
        />
      )}
      <ViewChips<View>
        tabs={[
          { id: 'tasks', label: 'Tasks' },
          { id: 'board', label: 'Board' },
          { id: 'notes', label: 'Notes' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'tasks' && (
        <>
          <div className={styles.summary}>
            <div>
              <span>Progress</span>
              <strong>{Math.round(stat.progress * 100)}%</strong>
            </div>
            <div>
              <span>Open tasks</span>
              <strong>{stat.open}</strong>
            </div>
            <div>
              <span>Due</span>
              <strong>{row.end ? row.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'None'}</strong>
            </div>
            <div>
              <span>Time blocked</span>
              <strong>{durationText(stat.weekMinutes)}</strong>
            </div>
          </div>
          <TaskCard title="Open tasks" tasks={[...open, ...done]} count={open.length} setDone={v.setDone} newHref={newTaskHref} />
        </>
      )}

      {view === 'board' && (
        <div className={styles.board}>
          {BOARD.map((s) => {
            const list = v.tasks.filter((t) => t.statusText === s);
            return (
              <div key={s} className={styles.boardColumn}>
                {list.length ? (
                  <TaskCard title={s} tasks={list} count={list.length} setDone={v.setDone} />
                ) : (
                  <section className={styles.card} aria-label={s}>
                    <h2 className={styles.cardHead}>
                      <span className={styles.dot} aria-hidden />
                      {s}
                      <span className={styles.cardCount}>0</span>
                    </h2>
                    <p className={styles.empty}>Nothing here</p>
                  </section>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'notes' && (
        <textarea
          className={styles.notes}
          aria-label="Notes"
          value={notes}
          placeholder="Write anything about this project"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && draft !== v.notes) void v.saveNotes(draft);
            setDraft(null);
          }}
        />
      )}
    </div>
  );
}

function TaskCard({ title, tasks, count, setDone, newHref }: { title: string; tasks: TaskListItem[]; count: number; setDone: (t: TaskListItem, done: boolean) => Promise<unknown>; newHref?: string }) {
  const taskPanel = useTaskPanel();
  if (!tasks.length)
    return (
      <p className={styles.empty}>
        No tasks yet.{' '}
        {newHref && (
          <Link href={newHref} className={styles.textAction}>
            Add the first one
          </Link>
        )}
      </p>
    );
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardHead}>
        <span className={styles.dot} aria-hidden />
        {title}
        <span className={styles.cardCount}>{count}</span>
        {newHref && (
          <Link href={newHref} className={styles.textAction}>
            <Plus size={16} strokeWidth={2.25} aria-hidden />
            New task
          </Link>
        )}
      </h2>
      {tasks.map((t) => {
        const isDone = t.status === 'done';
        return (
          <TaskLine
            key={t.id}
            title={t.title}
            done={isDone}
            onToggle={() => void setDone(t, !isDone)}
            onOpen={() => taskPanel.open(t.id)}
            right={isDone && t.completedAt ? `Done ${t.completedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : t.late ? t.dueText : t.minutes > 0 ? durationText(t.minutes) : t.dueText}
            late={!isDone && t.late}
            note={t.statusText === 'In progress' || t.statusText === 'Waiting' ? t.statusText : null}
            tags={
              <>
                {!isDone && <TypePill type={t.typeName} />}
                {t.blockText && <span>{t.blockText}</span>}
              </>
            }
          />
        );
      })}
    </section>
  );
}
