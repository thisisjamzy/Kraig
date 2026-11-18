'use client';

// Today on the phone (Dreda v1.0 `Today / Phone` 67470): "Today" with the
// date and the free time under it; Now on lime (the block under way, its
// type, the time left as a bar); Overdue (red text, never a red block;
// Move all to today); Today's plan, the day's blocks in time order on
// their label hues (Day view opens the Calendar); and the To plan peek
// above the tab bar. Swiping sideways switches to Money.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLogic, type TimeCalendarLogic } from '@/src/logic/timeCalendar/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { dayFromIso, type CalItem } from '@/src/viewmodels/calendarItems';
import { labelHue } from '@/src/viewmodels/projects';
import { clockText, durationText, lateText, rangeText } from '@/src/viewmodels/todayPlan';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HueTag, TypePill } from '@/src/widgets/TaskChips/TypePill';
import { TaskLine } from '@/src/phone/widgets/TaskCheckRow/TaskLine';
import { TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import { ToPlanSheet } from '@/src/phone/widgets/ToPlanSheet/ToPlanSheet';
import styles from '@/src/phone/screens/Projects/ProjectsScreen.module.css';

// Medium screens and up: the web Today. Its own chunk, so phones never
// download it.
const TodayScreen = dynamic(() => import('@/src/screens/Today/TodayScreen').then((m) => m.TodayScreen), { ssr: false });

const OVERDUE_SHOWN = 3;

export function ProjectsScreen() {
  const { isWide } = useLayout();
  return isWide ? <TodayScreen /> : <TodayPhone />;
}

function TodayPhone() {
  const logic = useLogic();
  const swipeRef = useSwipeModeSwitch('projects');
  const today = dayFromIso(logic.today);
  const sub = `${today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })} · ${durationText(logic.freeOn(logic.today))} free`;

  return (
    <div className={styles.page} ref={swipeRef}>
      <TimeHeader title="Today" sub={sub} />
      <ScreenState loading={logic.loading} />
      <NowCard logic={logic} />
      <Overdue logic={logic} />
      <DayPlan logic={logic} />
      <ToPlanSheet logic={logic} />
    </div>
  );
}

function NowCard({ logic }: { logic: TimeCalendarLogic }) {
  const minute = useNowMinute();
  const taskPanel = useTaskPanel();
  const now = minute * 60000;
  const item = logic
    .itemsOn(logic.today)
    .filter((i) => !i.allDay && i.start && i.end && !i.done)
    .find((i) => i.start!.getTime() <= now && i.end!.getTime() > now);
  if (!item) return null;
  const row = item.taskId ? logic.tasksOn(logic.today).find((r) => r.id === item.taskId) : undefined;
  const total = item.end!.getTime() - item.start!.getTime();
  const left = Math.max(0, Math.round((item.end!.getTime() - now) / 60000));
  const share = total > 0 ? (now - item.start!.getTime()) / total : 0;
  return (
    <button type="button" className={styles.now} onClick={() => (item.taskId ? taskPanel.open(item.taskId) : item.href && window.location.assign(item.href))}>
      <span className={styles.nowTop}>
        <span className={styles.nowChip}>Now {clockText(new Date(now))}</span>
        {row && <TypePill type={row.typeName} size="sm" />}
      </span>
      <span className={styles.nowTitle}>{item.title}</span>
      <span className={styles.nowMeta}>
        {rangeText(item.start!, item.end)}, {durationText(left)} left{item.project ? ` · ${item.project}` : ''}
      </span>
      <span className={styles.nowBar} aria-hidden>
        <span style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
      </span>
    </button>
  );
}

function Overdue({ logic }: { logic: TimeCalendarLogic }) {
  const taskPanel = useTaskPanel();
  const [busy, setBusy] = useState(false);
  const rows = logic.overdue;
  if (rows.length === 0) return null;
  const now = new Date();
  return (
    <section className={styles.card} aria-label="Overdue">
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          Overdue <span className={styles.cardCount}>{rows.length}</span>
        </h2>
        <button
          type="button"
          className={styles.link}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await logic.moveToToday(rows);
            } finally {
              setBusy(false);
            }
          }}
        >
          Move all to today
        </button>
      </div>
      <div>
        {rows.slice(0, OVERDUE_SHOWN).map((r) => (
          <TaskLine
            key={r.id}
            title={r.title}
            done={r.done}
            onToggle={() => void logic.db.actions.setDone(r, !r.done)}
            onOpen={() => taskPanel.open(r.id)}
            right={lateText(r.date, now)}
            late
            tags={
              <>
                {r.projectName && <HueTag hue={labelHue(r.projectColor)}>{r.projectName}</HueTag>}
                {r.minutes > 0 && <span>{durationText(r.minutes)}</span>}
              </>
            }
          />
        ))}
      </div>
      {rows.length > OVERDUE_SHOWN && (
        <Link href="/tasks" className={styles.link}>
          {rows.length - OVERDUE_SHOWN} more in Tasks
        </Link>
      )}
    </section>
  );
}

function blockLine(item: CalItem, completed: Date | null) {
  if (item.done) return completed ? `Done at ${clockText(completed)}` : 'Done';
  return item.start ? rangeText(item.start, item.end) : '';
}

function DayPlan({ logic }: { logic: TimeCalendarLogic }) {
  const taskPanel = useTaskPanel();
  const router = useRouter();
  const items = logic
    .itemsOn(logic.today)
    .filter((i) => !i.allDay && i.start)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const completed = new Map(logic.tasksOn(logic.today).map((r) => [r.id, r.completed]));
  const blocked = logic.busyOn(logic.today).reduce((s, b) => s + b.endMin - b.startMin, 0);
  return (
    <section className={styles.card} aria-label="Today's plan">
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          Today&apos;s plan <span className={styles.cardMeta}>{durationText(blocked)} blocked</span>
        </h2>
        <Link href="/projects/calendar" className={styles.link}>
          Day view
        </Link>
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>Nothing blocked today. Open To plan to give your tasks a time.</p>
      ) : (
        <ol className={styles.plan}>
          {items.map((i) => (
            <li key={i.key} className={styles.planRow}>
              <span className={styles.planTime}>{clockText(i.start!)}</span>
              <button
                type="button"
                className={styles.block}
                data-hue={i.hue ?? 'grey'}
                onClick={() => (i.taskId ? taskPanel.open(i.taskId) : i.bookingId ? router.push('/projects/calendar') : i.href && window.location.assign(i.href))}
              >
                <span className={styles.blockTitle}>{i.title}</span>
                <span className={styles.blockTime}>{blockLine(i, i.taskId ? (completed.get(i.taskId) ?? null) : null)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
