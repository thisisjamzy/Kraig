'use client';

// Design/task5.JPG's "Schedule" frame — a horizontally scrolling week-strip
// date picker over a vertical, hour-by-hour agenda timeline, replacing the
// old month-grid-plus-agenda-list layout (Design/task4.jpg's "frame two").
// The month grid isn't gone, just moved: tapping the month label opens it
// in a popover for jumping to an arbitrary date, since a single week strip
// alone can't reach a date more than a couple of weeks away without a lot
// of scrolling.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { CalendarClock, ChevronDown, FolderKanban, ListPlus, ShoppingBasket, Target, Wallet } from 'lucide-react';
import { useLogic } from '@/src/logic/projectsCalendar/useLogic';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import { iconTint } from '@/src/viewmodels/iconTint';
import styles from './ProjectsCalendarScreen.module.css';

// The date strip's own scrollable window — wide enough either side of
// "today" that picking any day within about three weeks never needs the
// month popover at all, while a single render still only ever builds one
// fixed-size array.
const STRIP_DAYS_BEFORE = 7;
const STRIP_DAYS_TOTAL = 35;

function buildDateStrip(anchorIso: string): Date[] {
  const anchor = new Date(`${anchorIso}T00:00:00`);
  const start = new Date(anchor);
  start.setDate(start.getDate() - STRIP_DAYS_BEFORE);
  return Array.from({ length: STRIP_DAYS_TOTAL }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function ProjectsCalendarScreen() {
  const {
    monthCursor,
    goToMonth,
    daysWithItems,
    selectedDate,
    selectDay,
    agenda,
    todayIso,
    openProject,
    openPayment,
    loading,
  } = useLogic();
  const router = useRouter();

  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // An anchored popover next to the date button (not a full-screen Modal) —
  // same convention as Home's own currency picker
  // (src/screens/Home/HomeScreen.tsx's currencyMenuRef): closes on an
  // outside click/tap or Escape.
  const monthMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!monthPickerOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (monthMenuRef.current && !monthMenuRef.current.contains(event.target as Node)) {
        setMonthPickerOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMonthPickerOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [monthPickerOpen]);

  // The strip's own anchor stays put across re-selections within its
  // window so scrolling doesn't jump around — it only ever re-centers at
  // the specific call sites that can jump far away (the month popover,
  // "Jump to today"), never reactively off of every selectedDate change.
  const [stripAnchor, setStripAnchor] = useState(selectedDate);
  function selectDayAndRecenter(iso: string) {
    selectDay(iso);
    setStripAnchor(iso);
  }

  const strip = useMemo(() => buildDateStrip(stripAnchor), [stripAnchor]);

  const stripRef = useRef<HTMLDivElement>(null);
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedDayRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedDate, strip]);

  const hasAllDayItems = agenda.projectItems.length > 0 || agenda.paymentItems.length > 0;
  const hasAnything = agenda.taskItems.length > 0 || hasAllDayItems;
  const isToday = selectedDate === todayIso;

  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.monthWrap} ref={monthMenuRef}>
          <button
            type="button"
            className={styles.monthButton}
            onClick={() => setMonthPickerOpen((current) => !current)}
            aria-expanded={monthPickerOpen}
          >
            {monthLabel}
            <ChevronDown size={16} strokeWidth={2.25} />
          </button>

          {monthPickerOpen && (
            <div className={styles.monthPopover} onClick={(event) => event.stopPropagation()}>
              <Calendar.Root
                focusedValue={parseDate(toDateOnly(monthCursor))}
                onFocusChange={(date) => goToMonth(new Date(date.year, date.month - 1, date.day))}
                value={parseDate(selectedDate)}
                onChange={(date) => {
                  if (date) {
                    selectDayAndRecenter(date.toString());
                    setMonthPickerOpen(false);
                  }
                }}
              >
                <Calendar.Header className={styles.calendarHeader}>
                  <Calendar.NavButton slot="previous" className={styles.calendarNavButton} />
                  <Calendar.Heading className={styles.calendarHeading} />
                  <Calendar.NavButton slot="next" className={styles.calendarNavButton} />
                </Calendar.Header>
                <Calendar.Grid className={styles.calendarGrid}>
                  <Calendar.GridHeader>
                    {(day) => <Calendar.HeaderCell className={styles.weekdayCell}>{day}</Calendar.HeaderCell>}
                  </Calendar.GridHeader>
                  <Calendar.GridBody>
                    {(date) => (
                      <Calendar.Cell date={date} className={styles.dayCell}>
                        {({ formattedDate }) => (
                          <span className={styles.dayCellInner}>
                            {formattedDate}
                            {daysWithItems.has(date.toString()) && <span className={styles.dayDot} />}
                          </span>
                        )}
                      </Calendar.Cell>
                    )}
                  </Calendar.GridBody>
                </Calendar.Grid>
              </Calendar.Root>
            </div>
          )}
        </div>

        <ActionMenu
          ariaLabel="Schedule actions"
          items={[
            {
              key: 'today',
              label: 'Jump to today',
              icon: <CalendarClock size={14} strokeWidth={2} />,
              onSelect: () => {
                goToMonth(new Date());
                selectDayAndRecenter(todayIso);
              },
            },
            {
              key: 'new-task',
              label: 'New task',
              icon: <ListPlus size={14} strokeWidth={2} />,
              onSelect: () => router.push('/tasks/new'),
            },
          ]}
        />
      </div>

      <div className={styles.dateStrip} ref={stripRef} data-hscroll="true">
        {strip.map((date) => {
          const iso = toDateOnly(date);
          const isSelected = iso === selectedDate;
          return (
            <button
              key={iso}
              ref={isSelected ? selectedDayRef : undefined}
              type="button"
              className={`${styles.stripDay} ${isSelected ? styles.stripDaySelected : ''}`}
              onClick={() => selectDay(iso)}
            >
              <span className={styles.stripDayLabel}>
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={styles.stripDateNum}>{date.getDate()}</span>
              {daysWithItems.has(iso) && !isSelected && <span className={styles.stripDot} />}
            </button>
          );
        })}
      </div>

      <ScreenState loading={loading} />

      {!loading && !hasAnything && (
        <div className={styles.emptyState}>
          <ShoppingBasket size={40} strokeWidth={1.5} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>{isToday ? 'All done for today!' : 'Nothing scheduled'}</p>
          <p className={styles.emptyPrompt}>Want to add a task for this day?</p>
          <Link href="/tasks/new" className={styles.emptyCta}>
            <ListPlus size={16} strokeWidth={2.25} />
            Add task
          </Link>
        </div>
      )}

      {!loading && hasAnything && (
        <div className={styles.timeline}>
          {hasAllDayItems && (
            <div className={styles.allDayGroup}>
              {agenda.projectItems.map((item) => (
                <button
                  key={`${item.id}-${item.label}`}
                  type="button"
                  className={styles.allDayRow}
                  onClick={() => openProject(item.id)}
                >
                  <span className={styles.agendaIcon} style={{ background: iconTint(item.isMilestone ? 3 : 4) }}>
                    {item.isMilestone ? <Target size={16} strokeWidth={2} /> : <FolderKanban size={16} strokeWidth={2} />}
                  </span>
                  <div className={styles.agendaTaskBody}>
                    <p className={styles.agendaTitleBlock}>{item.title}</p>
                    <span className={styles.agendaTypeCaption}>{item.label}</span>
                  </div>
                </button>
              ))}
              {agenda.paymentItems.map((payment) => (
                <button key={payment.id} type="button" className={styles.allDayRow} onClick={openPayment}>
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

          {agenda.taskItems.length > 0 && (
            <div className={styles.taskList}>
              {agenda.taskItems.map((item) => (
                <TaskCard key={item.id} task={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
