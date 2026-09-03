'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/tasksList/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import styles from './TasksListScreen.module.css';

export function TasksListScreen() {
  const { title, tasks, openTask, goBack, loading } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <>
          {tasks.length === 0 ? (
            <p className={styles.emptyText}>Nothing here.</p>
          ) : (
            <div className={styles.list}>
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => openTask(task.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
