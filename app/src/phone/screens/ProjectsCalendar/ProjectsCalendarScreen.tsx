'use client';

// Calendar + daily schedule, per the Time module brief: a header (menu icon,
// month title), a Monday-first month grid in its own tinted panel with
// rounded top corners, then "Schedule" / "Add Event" over an hour timeline
// (08.00 labels, faint guide lines) with each task placed at its start time.
// Tasks render with exactly the Time hub's own card (TaskCheckRow): the radio
// completes the task, anything else on the card opens its edit page. On web
// the grid sits beside the schedule. "Add Event" opens the new task form on
// the selected day. The generic AppHeader is off on this
// route (chromeVisibility.ts) — this header replaces it.

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarClock, FolderKanban, ListPlus, RefreshCw, Target, Wallet } from 'lucide-react';
import { useLogic, HOUR_HEIGHT } from '@/src/phone/logic/projectsCalendar/useLogic';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCheckRow } from '@/src/phone/widgets/TaskCheckRow/TaskCheckRow';
import { GoogleEventCard } from '@/src/phone/widgets/GoogleEventCard/GoogleEventCard';
import { CalendarSyncStatus } from '@/src/widgets/CalendarSyncStatus/CalendarSyncStatus';
import { syncNow } from '@/src/widgets/CalendarSyncStatus/syncNow';
import { isCalendarSyncEnabled } from '@/src/shared/calendarSync/runner';
import { DayTimeline } from '@/src/phone/screens/ProjectsCalendar/DayTimeline';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from '@/src/phone/screens/ProjectsCalendar/ProjectsCalendarScreen.module.css';
import webStyles from '@/src/phone/screens/ProjectsCalendar/ProjectsCalendarScreen.web.module.css';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function hourLabel(hour: number) {
  return `${String(hour % 24).padStart(2, '0')}.00`;
}

export function ProjectsCalendarScreen() {
  const logic = useLogic();
  // Phone line only: the web calendar is src/screens/ProjectsCalendar.
  return <ProjectsCalendarView {...logic} isWeb={false} />;
}

export type ProjectsCalendarViewProps = Pick<
  ReturnType<typeof useLogic>,
  | 'monthCursor'
  | 'daysWithItems'
  | 'selectedDate'
  | 'todayIso'
  | 'agenda'
  | 'allDayTasks'
  | 'allDayGoogle'
  | 'schedule'
  | 'syncRange'
  | 'monthGrid'
  | 'shiftMonth'
  | 'pickDate'
  | 'jumpToToday'
  | 'openAddEvent'
  | 'openProject'
  | 'openPayment'
  | 'loading'
> & { isWeb: boolean };

/** The whole calendar UI, fed by props — ProjectsCalendarScreen wires it to
 * live data; keeping it presentational means it can also be rendered with
 * fixed sample data to check its layout. */
export function ProjectsCalendarView({
  monthCursor,
  daysWithItems,
  selectedDate,
  todayIso,
  agenda,
  allDayTasks,
  allDayGoogle,
  schedule,
  syncRange,
  monthGrid,
  shiftMonth,
  pickDate,
  jumpToToday,
  openAddEvent,
  openProject,
  openPayment,
  loading,
  isWeb,
}: ProjectsCalendarViewProps) {

  // Swipe the month panel left/right to change month — the brief's header
  // carries only the menu and the title, so there are no arrow buttons.
  const touchStartX = useRef<number | null>(null);
  function onPanelTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }
  function onPanelTouchEnd(event: React.TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;
    const dx = endX - startX;
    if (Math.abs(dx) > 50) shiftMonth(dx < 0 ? 1 : -1);
  }

  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const hasAllDay =
    agenda.projectItems.length > 0 || agenda.paymentItems.length > 0 || allDayTasks.length > 0 || allDayGoogle.length > 0;
  const syncEnabled = isCalendarSyncEnabled();

  return (
    <div className={`${styles.page} ${isWeb ? webStyles.page : ''}`}>
      <ScreenHeader
        center
        left={
            <ActionMenu
              ariaLabel="Calendar menu"
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
                  label: 'Jump to today',
                  icon: <CalendarClock size={14} strokeWidth={2} />,
                  onSelect: jumpToToday,
                },
                {
                  key: 'previous',
                  label: 'Previous month',
                  icon: <ChevronLeft size={14} strokeWidth={2} />,
                  onSelect: () => shiftMonth(-1),
                },
                {
                  key: 'next',
                  label: 'Next month',
                  icon: <ChevronRight size={14} strokeWidth={2} />,
                  onSelect: () => shiftMonth(1),
                },
                {
                  key: 'add',
                  label: 'Add event',
                  icon: <ListPlus size={14} strokeWidth={2} />,
                  onSelect: openAddEvent,
                },
                ...(syncEnabled
                  ? [
                      {
                        key: 'sync',
                        label: 'Sync with Google Calendar',
                        icon: <RefreshCw size={14} strokeWidth={2} />,
                        onSelect: () => void syncNow(syncRange),
                      },
                    ]
                  : []),
              ]}
            />
        }
        title={monthLabel}
      />

        <div className={`${styles.layout} ${isWeb ? webStyles.layout : ''}`}>
          <section
            className={`${styles.calendarPanel} ${isWeb ? webStyles.calendarPanel : ''}`}
            aria-label={monthLabel}
            onTouchStart={onPanelTouchStart}
            onTouchEnd={onPanelTouchEnd}
          >
            <div className={styles.weekdays}>
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className={styles.grid} role="grid">
              {monthGrid.map((cell) => {
                const isSelected = cell.iso === selectedDate;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-label={new Date(`${cell.iso}T00:00:00`).toDateString()}
                    className={styles.day}
                    data-outside={!cell.inMonth || undefined}
                    data-today={isToday || undefined}
                    onClick={() => pickDate(cell.iso)}
                  >
                    <span className={styles.dayNumber}>{cell.day}</span>
                    {daysWithItems.has(cell.iso) && !isSelected && <span className={styles.dayDot} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.schedule}>
            <div className={styles.scheduleHead}>
              <div>
                <h2 className={styles.scheduleTitle}>Schedule</h2>
                <p className={styles.scheduleDate}>{selectedLabel}</p>
                <CalendarSyncStatus range={syncRange} />
              </div>
              <button type="button" className={styles.addLink} onClick={openAddEvent}>
                Add Event
              </button>
            </div>

            <ScreenState loading={loading} />

            {hasAllDay && (
              <div className={styles.allDay}>
                {allDayTasks.map((task) => (
                  <TaskCheckRow key={task.id} task={task} timeOnly />
                ))}
                {allDayGoogle.map((event) => (
                  <GoogleEventCard key={event.id} event={event} />
                ))}
                {agenda.projectItems.map((item) => (
                  <button
                    key={`${item.id}-${item.label}`}
                    type="button"
                    className={styles.allDayItem}
                    onClick={() => openProject(item.id)}
                  >
                    <span className={styles.allDayIcon} data-kind="project">
                      {item.isMilestone ? <Target size={14} strokeWidth={2} /> : <FolderKanban size={14} strokeWidth={2} />}
                    </span>
                    <span className={styles.allDayText}>
                      <span className={styles.allDayTitle}>{item.title}</span>
                      <span className={styles.allDayMeta}>{item.label}</span>
                    </span>
                  </button>
                ))}
                {agenda.paymentItems.map((payment) => (
                  <button key={payment.id} type="button" className={styles.allDayItem} onClick={openPayment}>
                    <span className={styles.allDayIcon} data-kind="payment">
                      <Wallet size={14} strokeWidth={2} />
                    </span>
                    <span className={styles.allDayText}>
                      <span className={styles.allDayTitle}>{payment.title}</span>
                      <span className={styles.allDayMeta}>
                        Payment due · {payment.amount.toLocaleString()} {payment.currency}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!loading && (
              <div className={styles.timeline} style={{ height: schedule.height + 24 }}>
                {schedule.hours.map((hour) => (
                  <div
                    key={hour}
                    className={styles.hourRow}
                    style={{ top: (hour - schedule.firstHour) * HOUR_HEIGHT }}
                    aria-hidden
                  >
                    <span className={styles.hourLabel}>{hourLabel(hour)}</span>
                    <span className={styles.hourLine} />
                  </div>
                ))}
                <DayTimeline items={schedule.items} groups={schedule.groups} />
                {schedule.items.length === 0 && (
                  <p className={styles.emptyDay}>
                    Nothing scheduled.{' '}
                    <button type="button" className={styles.addLink} onClick={openAddEvent}>
                      Add an event
                    </button>
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

    </div>
  );
}
