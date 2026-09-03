'use client';

import { useLogic } from '@/src/logic/projectAnalytics/useLogic';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './ProjectAnalyticsScreen.module.css';

export function ProjectAnalyticsScreen() {
  const {
    overdue,
    today,
    completedTotal,
    completedTrend,
    taskReschedule,
    projectReschedule,
    projectsPerAreaSegments,
    completionPerArea,
    rescheduledByAreaSegments,
    openTask,
    loading,
  } = useLogic();

  const attention = [...overdue, ...today];

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Analytics</h1>

      <ScreenState loading={loading} />

      {!loading && (
        <>
          <div className={styles.statGrid}>
            <div className={`${styles.statTile} ${styles.tileGreen}`}>
              <span className={styles.statLabel}>Completed</span>
              <p className={styles.statValue}>{completedTotal}</p>
            </div>
            <div className={`${styles.statTile} ${styles.tileOrange}`}>
              <span className={styles.statLabel}>Overdue</span>
              <p className={overdue.length > 0 ? styles.statValueDanger : styles.statValue}>{overdue.length}</p>
            </div>
            <div className={`${styles.statTile} ${styles.tilePurple}`}>
              <span className={styles.statLabel}>Due today</span>
              <p className={styles.statValue}>{today.length}</p>
            </div>
            <div className={`${styles.statTile} ${styles.tileBlue}`}>
              <span className={styles.statLabel}>Rescheduled</span>
              <p className={styles.statValue}>{taskReschedule.rescheduled}</p>
            </div>
          </div>

          {attention.length > 0 && (
            <>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.chartTitle}>Needs attention</h2>
              </div>
              <div className={styles.list}>
                {attention.map((task) => (
                  <button key={task.id} type="button" className={styles.taskRow} onClick={() => openTask(task.id)}>
                    {task.emoji && <span className={styles.emojiSmall}>{task.emoji}</span>}
                    <p className={styles.taskTitle}>{task.title}</p>
                    <span className={styles.taskMetaDanger}>
                      {task.dueDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {completedTrend.some((p) => p.value > 0) && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Completed per week</p>
              <TrendChart points={completedTrend} color="var(--color-brand)" />
            </div>
          )}

          {projectsPerAreaSegments.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Ongoing projects per area</p>
              <DonutChart segments={projectsPerAreaSegments} legendPosition="bottom" />
            </div>
          )}

          {completionPerArea.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Task completion per area</p>
              <div className={styles.barList}>
                {completionPerArea.map((bucket) => (
                  <div key={bucket.areaName} className={styles.barRow}>
                    <div className={styles.barRowHeader}>
                      <span className={styles.barRowLabel}>{bucket.areaName}</span>
                      <span className={styles.barRowValue}>{bucket.percent}%</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={styles.barFill} style={{ width: `${bucket.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(projectReschedule.onTime > 0 || projectReschedule.rescheduled > 0) && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Finished projects: on time vs rescheduled</p>
              <DonutChart
                segments={[
                  { label: 'On time', value: projectReschedule.onTime, color: 'var(--color-brand)' },
                  { label: 'Rescheduled', value: projectReschedule.rescheduled, color: '#e8a33d' },
                ]}
              />
            </div>
          )}

          {(taskReschedule.onTime > 0 || taskReschedule.rescheduled > 0) && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Finished tasks: on time vs rescheduled</p>
              <DonutChart
                segments={[
                  { label: 'On time', value: taskReschedule.onTime, color: 'var(--color-brand)' },
                  { label: 'Rescheduled', value: taskReschedule.rescheduled, color: '#e8a33d' },
                ]}
              />
            </div>
          )}

          {rescheduledByAreaSegments.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Rescheduled projects by area</p>
              <DonutChart segments={rescheduledByAreaSegments} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
