'use client';

// Tasks on the phone (Dreda v1.0 `Tasks / Phone` 68187): "Tasks" with
// "21 open · 3 overdue · 6 today"; chips for Today, Upcoming and Inbox and
// a filter button (filter, sort and search); then a white card per group
// (Today: Overdue, then today). Each row: the check, the title, how late
// it is in red or its length, a note when it is under way or waiting, and
// its tags: project, type, time block.
// A link with a scope (?filter=, Insights' drill-downs) shows that scope
// under its own title with a back button.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListFilter, Plus, Upload } from 'lucide-react';
import { useLogic, TASK_TABS, type TaskGroup, type TaskListItem } from '@/src/logic/tasksList/useLogic';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { labelHue } from '@/src/viewmodels/projects';
import { durationText } from '@/src/viewmodels/todayPlan';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { HueTag, TypePill } from '@/src/widgets/TaskChips/TypePill';
import { TaskLine } from '@/src/phone/widgets/TaskCheckRow/TaskLine';
import { HeaderButton, HeaderMenu, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import styles from '@/src/phone/screens/TasksList/TasksListScreen.module.css';

const PHONE_TABS = TASK_TABS.filter((t) => t.id !== 'all');

export function TasksListScreen() {
  const logic = useLogic();
  const router = useRouter();
  const { list, fields, loading } = logic;
  const [tools, setTools] = useState(list.query.filters.length > 0 || list.query.search !== '');
  const groups: TaskGroup[] = logic.scoped ? [{ id: 'scope', label: logic.title, tone: null, tasks: logic.tasks }] : logic.groups;
  const sub = logic.scoped
    ? `${logic.tasks.length} ${logic.tasks.length === 1 ? 'task' : 'tasks'}`
    : [`${logic.openCount} open`, `${logic.overdueCount} overdue`, `${logic.todayCount} today`].join(' · ');

  return (
    <div className={styles.page}>
      <TimeHeader
        title={logic.scoped ? logic.title : 'Tasks'}
        sub={sub}
        actions={
          logic.scoped ? undefined : (
            <>
              <HeaderMenu label="Tasks actions" items={[{ key: 'import', label: 'Import tasks', icon: <Upload size={16} strokeWidth={2} />, onSelect: () => router.push('/settings/import') }]} />
              <HeaderButton label="New task" onClick={() => router.push('/tasks/new')}>
                <Plus size={20} strokeWidth={2} />
              </HeaderButton>
            </>
          )
        }
      />

      <div className={styles.chipsRow}>
        {!logic.scoped && (
          <div className={styles.chips} role="tablist" aria-label="View">
            {PHONE_TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={logic.tab === t.id} onClick={() => logic.setTab(t.id)}>
                {t.label}
                {logic.counts[t.id] > 0 && <span className={styles.chipCount}>{logic.counts[t.id]}</span>}
              </button>
            ))}
          </div>
        )}
        <button type="button" className={styles.filter} aria-pressed={tools} aria-label="Filter, sort and search" onClick={() => setTools((v) => !v)}>
          <ListFilter size={20} strokeWidth={2} />
        </button>
      </div>

      {tools && (
        <ListQueryBar
          fields={fields}
          query={list.query}
          setQuery={list.setQuery}
          onClear={list.clear}
          count={logic.tasks.length}
          noun={['task', 'tasks']}
          stickyTop="0px"
        />
      )}

      <ScreenState loading={loading} />

      {!loading && logic.scoped && logic.leftoverCount > 0 && (
        <button type="button" className={styles.leftovers} onClick={logic.moveLeftoversToTomorrow} disabled={logic.movingLeftovers}>
          {logic.movingLeftovers ? 'Moving…' : `Move ${logic.leftoverCount} unfinished ${logic.leftoverCount === 1 ? 'task' : 'tasks'} to tomorrow`}
        </button>
      )}

      {!loading &&
        (logic.total === 0 ? (
          <p className={styles.empty}>Nothing here.</p>
        ) : groups.every((g) => g.tasks.length === 0) ? (
          list.query.filters.length > 0 || list.query.search ? (
            <ListQueryEmpty onClear={list.clearFilters} />
          ) : (
            <p className={styles.empty}>{logic.tab === 'inbox' ? 'The inbox is empty.' : logic.tab === 'upcoming' ? 'Nothing coming up.' : 'Nothing due today.'}</p>
          )
        ) : (
          groups.map((g) => <Group key={g.id} group={g} showHead={!logic.scoped} onDone={logic.setDone} />)
        ))}
    </div>
  );
}

function rowNote(t: TaskListItem): string | null {
  if (t.statusText === 'In progress' || t.statusText === 'Waiting' || t.statusText === 'In review') return t.statusText;
  return null;
}

function Group({ group, showHead, onDone }: { group: TaskGroup; showHead: boolean; onDone: (t: TaskListItem, done: boolean) => Promise<unknown> }) {
  const taskPanel = useTaskPanel();
  if (group.tasks.length === 0) return null;
  return (
    <section className={styles.card} aria-label={group.label}>
      {showHead && (
        <h2 className={styles.groupHead}>
          {group.tone && <span className={styles.dot} data-tone={group.tone} aria-hidden />}
          {group.label}
          <span className={styles.groupCount}>{group.tasks.length}</span>
        </h2>
      )}
      {group.tasks.map((t) => {
        const done = t.status === 'done';
        return (
          <TaskLine
            key={t.id}
            title={t.title}
            done={done}
            onToggle={() => void onDone(t, !done)}
            onOpen={() => taskPanel.open(t.id)}
            right={t.late ? t.dueText : t.minutes > 0 ? durationText(t.minutes) : null}
            late={t.late}
            note={rowNote(t)}
            tags={
              <>
                {t.projectName && <HueTag hue={labelHue(t.projectColor)}>{t.projectName}</HueTag>}
                {!done && <TypePill type={t.typeName} />}
                {done ? t.doneAt && <span>Done at {t.doneAt}</span> : t.blockText && <span>{t.blockText}</span>}
              </>
            }
          />
        );
      })}
    </section>
  );
}
