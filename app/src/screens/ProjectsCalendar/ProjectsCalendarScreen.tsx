'use client';

import { ChevronLeft, ChevronRight, FolderKanban, Target, Wallet } from 'lucide-react';
import { useLogic } from '@/src/logic/projectsCalendar/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { iconTint } from '@/src/viewmodels/iconTint';
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
              {agenda.taskItems.map((item) => (
                <TaskCard key={item.id} task={item} />
              ))}
              {agenda.projectItems.map((item) => (
                <button
                  key={`${item.id}-${item.label}`}
                  type="button"
                  className={styles.agendaRow}
                  onClick={() => openProject(item.id)}
                >
                  <span className={styles.agendaIcon} style={{ background: iconTint(item.isMilestone ? 3 : 4) }}>
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
                  <span className={styles.agendaIcon} style={{ background: iconTint(5) }}>
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
