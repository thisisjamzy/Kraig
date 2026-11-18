'use client';

// Calendar on the phone (Dreda v1.0 `Calendar / Phone / Day` 67699):
// "Calendar" with the date and week under it, and New task in the header;
// Day, Week and Month; in Day, the week's strip (the selected day on
// lime, a dot on days with items) over the day's hour grid, blocks on
// their label hues and the now line with its lime chip. The To plan peek
// sits above the tab bar; a task in it opens Block time (67918).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/timeCalendar/useLogic';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { dayFromIso, mondayOf, shiftDay, type CalItem } from '@/src/viewmodels/calendarItems';
import { weekNumber } from '@/src/viewmodels/todayPlan';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { DayGrid } from '@/src/phone/widgets/DayGrid/DayGrid';
import { MonthDays, WeekStrip } from '@/src/phone/widgets/DayGrid/WeekStrip';
import { HeaderButton, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { ToPlanSheet } from '@/src/phone/widgets/ToPlanSheet/ToPlanSheet';
import { BookingRequest } from '@/src/widgets/SchedulingLinks/BookingRequest';
import styles from '@/src/phone/screens/ProjectsCalendar/ProjectsCalendarScreen.module.css';

type View = 'day' | 'week' | 'month';

export function ProjectsCalendarScreen() {
  const logic = useLogic();
  const router = useRouter();
  const taskPanel = useTaskPanel();
  const [view, setView] = useState<View>('day');
  const { selected, today, pick } = logic;
  const date = dayFromIso(selected);
  const sub = `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })} · Week ${weekNumber(date)}`;

  const [bookingId, setBookingId] = useState<string | null>(null);
  const opened = bookingId ? logic.bookingOf(bookingId) : null;

  function open(item: CalItem) {
    if (item.bookingId) setBookingId(item.bookingId);
    else if (item.taskId) taskPanel.open(item.taskId);
    else if (item.href) router.push(item.href);
  }
  const common = {
    itemsOn: (iso: string) => logic.itemsOn(iso),
    today,
    onOpen: open,
    onEmpty: (iso: string, minute: number) => taskPanel.open('new', { date: iso, start: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` }),
  };

  return (
    <div className={styles.page}>
      <TimeHeader
        title="Calendar"
        sub={sub}
        actions={
          <HeaderButton label="New task" onClick={() => taskPanel.open('new', { date: selected })}>
            <Plus size={20} strokeWidth={2} />
          </HeaderButton>
        }
      />
      <div className={styles.segmented} role="tablist" aria-label="View">
        {(['day', 'week', 'month'] as View[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>
      <ScreenState loading={logic.loading} />

      {view === 'month' ? (
        <div className={styles.card}>
          <MonthDays selected={selected} today={today} onPick={(iso) => (pick(iso), setView('day'))} countOf={logic.countOn} />
        </div>
      ) : (
        <>
          <WeekStrip selected={selected} today={today} onPick={pick} countOf={logic.countOn} />
          <div className={styles.card}>
            <DayGrid days={view === 'week' ? Array.from({ length: 7 }, (_, i) => shiftDay(mondayOf(selected), i)) : [selected]} {...common} />
          </div>
        </>
      )}
      <ToPlanSheet logic={logic} />
      {opened && (
        <BookingRequest
          sheet
          booking={opened.booking}
          link={opened.link}
          onAnswer={(a) => logic.answerBooking(opened.booking.id, a)}
          onClose={() => setBookingId(null)}
        />
      )}
    </div>
  );
}
