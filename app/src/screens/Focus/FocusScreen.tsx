'use client';

// Focus — every pending task on an Eisenhower board (drag between
// quadrants). One header row: menu, the title, and "new task". The generic
// AppHeader is off on this route (chromeVisibility.ts) — this header
// replaces it.

import { CalendarDays, List, ListChecks, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLogic } from '@/src/logic/focus/useLogic';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { FocusKanban } from './FocusKanban';
import styles from './FocusScreen.module.css';

export function FocusScreen() {
  return <FocusView {...useLogic()} />;
}

/** The whole Focus UI, fed by props — FocusScreen wires it to live data;
 * presentational so it can also be rendered with sample tasks. */
export function FocusView({ search, setSearch, columns, moveToQuadrant, newTask, loading }: ReturnType<typeof useLogic>) {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <ScreenHeader
        className={styles.header}
        sticky={false}
        large
        left={
            <ActionMenu
              ariaLabel="Menu"
              triggerClassName={styles.menuButton}
              triggerIcon={
                <span className={styles.menuIcon} aria-hidden>
                  <span />
                  <span />
                </span>
              }
              items={[
                {
                  key: 'today',
                  label: "Today's tasks",
                  icon: <ListChecks size={14} strokeWidth={2} />,
                  onSelect: () => router.push('/tasks?filter=today'),
                },
                {
                  key: 'all',
                  label: 'All tasks',
                  icon: <List size={14} strokeWidth={2} />,
                  onSelect: () => router.push('/tasks?filter=all'),
                },
                {
                  key: 'calendar',
                  label: 'Calendar',
                  icon: <CalendarDays size={14} strokeWidth={2} />,
                  onSelect: () => router.push('/projects/calendar'),
                },
              ]}
            />
        }
        title="Focus"
        right={
            <button type="button" className={styles.newButton} onClick={() => newTask()} aria-label="New task">
              <Plus size={18} strokeWidth={2.5} />
            </button>
        }
      />

      <ScreenState loading={loading} />

      {!loading && (
        <FocusKanban
          columns={columns}
          search={search}
          setSearch={setSearch}
          onMove={moveToQuadrant}
          onAdd={(quadrant) => newTask(quadrant)}
        />
      )}
    </div>
  );
}
