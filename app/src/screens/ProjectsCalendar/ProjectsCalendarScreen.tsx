'use client';

import { ChevronLeft, ChevronRight, FolderKanban, Target, Wallet } from 'lucide-react';
import { useLogic } from '@/src/logic/projectsCalendar/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskQuickActionsMenu } from '@/src/widgets/TaskQuickActionsMenu/TaskQuickActionsMenu';
import { formatTaskDateRange } from '@/src/shared/formatTaskDateRange';
import { TASK_TYPE_LABEL, TASK_TYPE_ICON } from '@/src/viewmodels/projects';
import styles from './ProjectsCalendarScreen.module.css';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ProjectsCalendarScreen() {
  const {
    monthCursor,
    shiftMonth,
    grid,
    daysWithItems,
    selectedDate,
    selectDay,
    agenda,
    todayIso,
    openTask,
    openProject,
    openPayment,
    loading,
  } = useLogic();

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Calendar</h1>

      <div className={styles.monthHeader}>
        <button type="button" className={styles.monthNavButton} onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <span className={styles.chartTitle}>
          {monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" className={styles.monthNavButton} onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className={styles.dayGrid}>
        {grid.map((cell, index) =>
          cell.date ? (
            <button
              key={cell.date}
              type="button"
              className={`${styles.dayCell} ${cell.date === todayIso ? styles.dayCellToday : ''} ${
                cell.date === selectedDate ? styles.dayCellSelected : ''
              }`}
              onClick={() => selectDay(cell.date!)}
            >
              {cell.day}
              {daysWithItems.has(cell.date) && <span className={styles.dayDot} />}
            </button>
          ) : (
            <span key={`blank-${index}`} />
          )
        )}
      </div>

      <ScreenState loading={loading} />

      {!loading && (
        <>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.chartTitle}>
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </h2>
          </div>

          {agenda.taskItems.length === 0 && agenda.projectItems.length === 0 && agenda.paymentItems.length === 0 ? (
            <p className={styles.statLabel}>Nothing scheduled this day.</p>
          ) : (
            <div className={styles.agendaGroup}>
              {agenda.taskItems.map((item) => {
                // Falls back to the To-do icon/label for any task whose
                // stored `type` isn't one of the three known values (an
                // older or hand-edited doc) — a lookup miss must never
                // render `undefined` as a component, which crashes.
                const TypeIcon = TASK_TYPE_ICON[item.type] ?? TASK_TYPE_ICON.ToDo;
                const typeLabel = TASK_TYPE_LABEL[item.type] ?? TASK_TYPE_LABEL.ToDo;
                return (
                  <div
                    key={item.id}
                    className={styles.agendaRow}
                    role="button"
                    tabIndex={0}
                    onClick={() => openTask(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTask(item.id);
                      }
                    }}
                  >
                    <span className={styles.agendaIcon}>
                      <TypeIcon size={16} strokeWidth={2} />
                    </span>
                    <div className={styles.agendaTaskBody}>
                      <span className={styles.agendaTypeCaption}>{typeLabel}</span>
                      <p className={`${styles.agendaTitleBlock} ${item.done ? styles.agendaTitleDone : ''}`}>
                        {item.emoji ? `${item.emoji} ` : ''}
                        {item.title}
                      </p>
                      <span className={styles.agendaTime}>{formatTaskDateRange(item.startTime, item.dueDate)}</span>
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                      <TaskQuickActionsMenu taskId={item.id} priority={item.priority} done={item.done} dueDate={item.dueDate} />
                    </span>
                  </div>
                );
              })}
              {agenda.projectItems.map((item) => (
                <button
                  key={`${item.id}-${item.label}`}
                  type="button"
                  className={styles.agendaRow}
                  onClick={() => openProject(item.id)}
                >
                  <span className={styles.agendaIcon}>
                    {item.isMilestone ? <Target size={16} strokeWidth={2} /> : <FolderKanban size={16} strokeWidth={2} />}
                  </span>
                  <div className={styles.agendaTaskBody}>
                    <p className={styles.agendaTitleBlock}>
                      {item.emoji ? `${item.emoji} ` : ''}
                      {item.title}
                    </p>
                    <span className={styles.agendaTypeCaption}>{item.label}</span>
                  </div>
                </button>
              ))}
              {agenda.paymentItems.map((payment) => (
                <button key={payment.id} type="button" className={styles.agendaRow} onClick={openPayment}>
                  <span className={styles.agendaIcon}>
                    <Wallet size={16} strokeWidth={2} />
                  </span>
                  <div className={styles.agendaTaskBody}>
                    <span className={styles.agendaTypeCaption}>Payment due</span>
                    <p className={styles.agendaTitleBlock}>{payment.title}</p>
                    <span className={styles.agendaTime}>
                      {payment.amount.toLocaleString()} {payment.currency}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
