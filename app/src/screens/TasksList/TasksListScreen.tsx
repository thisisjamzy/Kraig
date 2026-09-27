'use client';

// The tasks list — its scope comes from the link (today, this week,
// overdue, all, or an Insights drill-down); the Notion-style toolbar under
// the header filters, sorts and searches within it.

import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/tasksList/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCheckRow } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from './TasksListScreen.module.css';

// Pinned under this screen's own sticky header.
const STICKY_TOP = 'var(--header-height)';

export function TasksListScreen() {
  const { title, tasks, total, fields, list, goBack, loading, leftoverCount, movingLeftovers, moveLeftoversToTomorrow } =
    useLogic();
  const router = useRouter();

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={title}
        right={
          <button
            type="button"
            className={styles.addIconButton}
            onClick={() => router.push('/tasks/new')}
            aria-label="New task"
            title="New task"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        }
      />

      <ListQueryBar
        className={styles.toolbarSlot}
        fields={fields}
        query={list.query}
        setQuery={list.setQuery}
        onClear={list.clear}
        count={tasks.length}
        noun={['task', 'tasks']}
        stickyTop={STICKY_TOP}
      />

      <ScreenState loading={loading} />

      {!loading && leftoverCount > 0 && (
        <button type="button" className={styles.leftovers} onClick={moveLeftoversToTomorrow} disabled={movingLeftovers}>
          {movingLeftovers ? 'Moving…' : `Move ${leftoverCount} unfinished ${leftoverCount === 1 ? 'task' : 'tasks'} to tomorrow`}
        </button>
      )}

      {!loading &&
        (total === 0 ? (
          <p className={styles.emptyText}>Nothing here.</p>
        ) : tasks.length === 0 ? (
          <ListQueryEmpty onClear={list.clearFilters} />
        ) : (
          <div className={styles.list}>
            {tasks.map((task) => (
              <TaskCheckRow key={task.id} task={task} />
            ))}
          </div>
        ))}
    </div>
  );
}
