'use client';

// Time v1.0's task table (Dreda v1.0 `Tasks table` in 53712; also the
// area, folder and project pages): grouped rows with the round check, the
// task (its length under it), then the columns asked for: project, type,
// time block, due, done at, status. Names wrap; times stay on one line.
// Overdue is red text, never a red block.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TaskListItem } from '@/src/viewmodels/taskListItem';
import { labelHue, type LabelHue } from '@/src/viewmodels/projects';
import { durationText } from '@/src/viewmodels/todayPlan';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { HueTag, TypePill } from '@/src/widgets/TaskChips/TypePill';
import styles from './TaskTable.module.css';

export type TaskColumn = 'project' | 'type' | 'block' | 'due' | 'doneAt' | 'status';
export const ALL_TASK_COLUMNS: TaskColumn[] = ['project', 'type', 'block', 'due', 'doneAt', 'status'];

const LABEL: Record<TaskColumn, string> = { project: 'Project', type: 'Type', block: 'Time block', due: 'Due', doneAt: 'Done at', status: 'Status' };

const STATUS_HUE: Record<string, LabelHue> = {
  'To do': 'grey',
  'In progress': 'purple',
  'In review': 'blue',
  Waiting: 'amber',
  Done: 'green',
  Cancelled: 'grey',
};

export interface TaskTableGroup {
  id: string;
  label: string;
  tone: 'danger' | 'positive' | null;
  tasks: TaskListItem[];
}

export function TaskTable({
  groups,
  grouped = true,
  columns = ALL_TASK_COLUMNS,
  onDone,
}: {
  groups: TaskTableGroup[];
  grouped?: boolean;
  columns?: TaskColumn[];
  onDone: (t: TaskListItem, done: boolean) => Promise<unknown>;
}) {
  const taskPanel = useTaskPanel();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const span = columns.length + 2;
  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.checkCell} aria-label="Done" />
            <th>Task</th>
            {columns.map((c) => (
              <th key={c}>{LABEL[c]}</th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => {
          const open = !closed.has(g.id);
          return (
            <tbody key={g.id}>
              {grouped && (
                <tr className={styles.groupRow}>
                  <th colSpan={span} scope="rowgroup">
                    <button
                      type="button"
                      className={styles.groupToggle}
                      aria-expanded={open}
                      onClick={() =>
                        setClosed((c) => {
                          const next = new Set(c);
                          if (next.has(g.id)) next.delete(g.id);
                          else next.add(g.id);
                          return next;
                        })
                      }
                    >
                      <ChevronDown size={16} strokeWidth={2.25} className={styles.chevron} aria-hidden />
                      {g.tone && <span className={styles.groupDot} data-tone={g.tone} aria-hidden />}
                      {g.label}
                      <span className={styles.groupCount}>{g.tasks.length}</span>
                    </button>
                  </th>
                </tr>
              )}
              {open &&
                g.tasks.map((t) => {
                  const done = t.status === 'done';
                  return (
                    <tr key={t.id} className={styles.row} data-done={done || undefined}>
                      <td className={styles.checkCell}>
                        <button type="button" className={styles.check} data-done={done || undefined} aria-pressed={done} aria-label={done ? `Mark ${t.title} not done` : `Mark ${t.title} done`} onClick={() => void onDone(t, !done)} />
                      </td>
                      <td>
                        <button type="button" className={styles.title} onClick={() => taskPanel.open(t.id)}>
                          {t.title}
                        </button>
                        {t.minutes > 0 && <span className={styles.sub}>{durationText(t.minutes)}</span>}
                      </td>
                      {columns.map((c) => (
                        <Cell key={c} column={c} t={t} done={done} />
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function Cell({ column, t, done }: { column: TaskColumn; t: TaskListItem; done: boolean }) {
  switch (column) {
    case 'project':
      return <td>{t.projectName && <HueTag hue={labelHue(t.projectColor)}>{t.projectName}</HueTag>}</td>;
    case 'type':
      return (
        <td>
          <TypePill type={t.typeName} size="sm" />
        </td>
      );
    case 'block':
      return <td className={styles.nowrap}>{t.blockText}</td>;
    case 'due':
      return (
        <td className={styles.nowrap} data-late={t.late || undefined}>
          {done && t.completedAt ? `Done ${t.completedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : t.dueText}
        </td>
      );
    case 'doneAt':
      return <td className={styles.nowrap}>{t.doneAt}</td>;
    case 'status':
      return (
        <td>
          <HueTag hue={STATUS_HUE[t.statusText] ?? 'grey'}>{t.statusText}</HueTag>
        </td>
      );
  }
}
