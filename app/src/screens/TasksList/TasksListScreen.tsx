'use client';

// Tasks (Dreda v1.0 `Tasks / Web / Today` 53712).
//   Title "Tasks"; under it "21 open · 3 overdue · 5 due today".
//   One view bar: Today, Upcoming, Inbox, All tasks on the left; Filter,
//   Sort and Search on the right (ListQueryBar).
//   One table, grouped (Today: Overdue, then today): task, project, type,
//   time block, due, done at, status. Names wrap; times stay on one line.
// A link with a scope (?filter=, Insights' drill-downs) shows that scope
// as one table under its own title, without the view bar.

import { useLogic, TASK_TABS, type TaskGroup } from '@/src/logic/tasksList/useLogic';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { TaskTable } from '@/src/widgets/TaskDb/TaskTable';
import styles from './TasksListScreen.module.css';

export function TasksListScreen() {
  const logic = useLogic();
  const { list, fields, loading } = logic;
  const title = logic.scoped ? logic.title : 'Tasks';
  const sub = logic.scoped
    ? `${logic.tasks.length} ${logic.tasks.length === 1 ? 'task' : 'tasks'}`
    : [`${logic.openCount} open`, `${logic.overdueCount} overdue`, `${logic.todayCount} due today`].join(' · ');
  const groups: TaskGroup[] = logic.scoped ? [{ id: 'scope', label: title, tone: null, tasks: logic.tasks }] : logic.groups;

  const tabs = logic.scoped ? undefined : (
    <div className={styles.tabs} role="tablist" aria-label="View">
      {TASK_TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={logic.tab === t.id} onClick={() => logic.setTab(t.id)}>
          {t.label}
          {t.id !== 'all' && logic.counts[t.id] > 0 && <span className={styles.tabCount}>{logic.counts[t.id]}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <NotionPage title={title} sub={sub} crumbs={[{ label: 'Tasks', href: '/tasks' }]}>
      <ListQueryBar
        className={styles.viewBar}
        fields={fields}
        query={list.query}
        setQuery={list.setQuery}
        onClear={list.clear}
        count={logic.tasks.length}
        noun={['task', 'tasks']}
        stickyTop="0px"
        leading={tabs}
      />
      <ScreenState loading={loading} />

      {!loading && logic.scoped && logic.leftoverCount > 0 && (
        <button type="button" className={styles.leftovers} onClick={logic.moveLeftoversToTomorrow} disabled={logic.movingLeftovers}>
          {logic.movingLeftovers ? 'Moving…' : `Move ${logic.leftoverCount} unfinished ${logic.leftoverCount === 1 ? 'task' : 'tasks'} to tomorrow`}
        </button>
      )}

      {!loading &&
        (logic.total === 0 ? (
          <p className={styles.empty}>Nothing here.</p>
        ) : groups.length === 0 ? (
          list.query.filters.length > 0 || list.query.search ? (
            <ListQueryEmpty onClear={list.clearFilters} />
          ) : (
            <p className={styles.empty}>{logic.tab === 'inbox' ? 'The inbox is empty.' : logic.tab === 'upcoming' ? 'Nothing coming up.' : 'Nothing due today.'}</p>
          )
        ) : (
          <TaskTable groups={groups} grouped={!logic.scoped} onDone={logic.setDone} />
        ))}
    </NotionPage>
  );
}
