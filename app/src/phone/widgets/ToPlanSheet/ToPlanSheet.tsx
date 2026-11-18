'use client';

// To plan on the phone (Dreda v1.0 `Today / Phone` 67470, `Calendar / Phone
// / Day` 67699 and `Block time sheet` 67918). A peek above the tab bar
// ("To plan 4 · 1 overdue · 3 h 30 min") opens a sheet of the tasks with
// no time block; tapping one opens Block time: the free slots that fit it
// (today and the next days), Block, or Pick another time on its form.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import type { TimeCalendarLogic } from '@/src/logic/timeCalendar/useLogic';
import { labelHue } from '@/src/viewmodels/projects';
import { dayText, DEFAULT_TASK_MINUTES, durationText, isToPlan, lateText, minuteText, type SlotOption } from '@/src/viewmodels/todayPlan';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { Modal } from '@/src/widgets/Modal/Modal';
import { DayChip, LatePill, TaskTrayCard } from '@/src/widgets/TaskChips/TaskTrayCard';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import styles from '@/src/phone/widgets/ToPlanSheet/ToPlanSheet.module.css';

export function ToPlanSheet({ logic }: { logic: TimeCalendarLogic }) {
  const [open, setOpen] = useState(false);
  const [blocking, setBlocking] = useState<TaskRow | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const now = new Date();
  const late = logic.overdue.filter((r) => isToPlan(r));
  const rows = [...late, ...logic.toPlan];
  const minutes = rows.reduce((s, r) => s + r.minutes, 0);
  if (rows.length === 0) return null;

  return (
    <>
      <button type="button" className={styles.peek} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className={styles.grabber} aria-hidden />
        <span className={styles.peekRow}>
          <span className={styles.peekTitle}>To plan</span>
          <span className={styles.count}>{rows.length}</span>
          {late.length > 0 && (
            <span className={styles.lateCount}>
              <span className={styles.dot} aria-hidden />
              {late.length} overdue
            </span>
          )}
          {minutes > 0 && <span className={styles.peekMeta}>{durationText(minutes)}</span>}
        </span>
      </button>

      {open && !blocking && (
        <Modal sheet title="To plan" onClose={() => setOpen(false)}>
          <div className={styles.list}>
            {rows.map((r) => {
              const lateBy = r.overdue ? lateText(r.date, now) : null;
              return (
                <TaskTrayCard
                  key={r.id}
                  row={r}
                  draggable={false}
                  onOpen={() => setBlocking(r)}
                  right={lateBy ? <LatePill>{lateBy}</LatePill> : r.date ? <DayChip>{dayText(r.date, now)}</DayChip> : undefined}
                />
              );
            })}
          </div>
          <button
            type="button"
            className={styles.tonal}
            onClick={async () => {
              setNote(null);
              try {
                const placed = await logic.planMyDay();
                setNote(placed === 0 ? 'No free time left today for these.' : `Planned ${placed} ${placed === 1 ? 'task' : 'tasks'} into today.`);
              } catch (e) {
                setNote(e instanceof Error ? e.message : 'Could not plan the day.');
              }
            }}
          >
            Plan my day
          </button>
          {note && (
            <p className={styles.note} role="status">
              {note}
            </p>
          )}
        </Modal>
      )}

      {blocking && (
        <BlockTimeSheet
          row={blocking}
          slots={logic.slotsFor(blocking)}
          onBlock={async (slot) => {
            await logic.scheduleAt(blocking.id, slot.iso, slot.startMin, slot.endMin);
            setBlocking(null);
            setOpen(false);
          }}
          onClose={() => setBlocking(null)}
        />
      )}
    </>
  );
}

/** Block time for a task: pick one of the free slots that fit it. */
export function BlockTimeSheet({ row, slots, onBlock, onClose }: { row: TaskRow; slots: SlotOption[]; onBlock: (slot: SlotOption) => Promise<void>; onClose: () => void }) {
  const router = useRouter();
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = row.minutes || DEFAULT_TASK_MINUTES;
  const slot = slots[pick];
  const now = new Date();

  return (
    <Modal sheet titleHidden onClose={onClose} title={`Block time for ${row.title}`}>
      <div className={styles.blockHead}>
        <p className={styles.kicker}>Block time for</p>
        <p className={styles.blockTitle}>{row.title}</p>
        <p className={styles.blockMeta}>
          {row.projectName && <HueTag hue={labelHue(row.projectColor)}>{row.projectName}</HueTag>}
          <span>{durationText(length)}</span>
          {row.date && (
            <>
              <span aria-hidden>·</span>
              <span>Due {dayText(row.date, now)}</span>
            </>
          )}
        </p>
      </div>
      <p className={styles.slotsLabel}>{slots.length ? `Free slots that fit ${durationText(length)}` : `No free slot of ${durationText(length)} this week.`}</p>
      <div className={styles.slots} role="radiogroup" aria-label="Free slots">
        {slots.map((s, i) => (
          <button key={`${s.iso}-${s.startMin}`} type="button" role="radio" aria-checked={pick === i} className={styles.slot} onClick={() => setPick(i)}>
            <span className={styles.radio} aria-hidden />
            <span>
              <span className={styles.slotTime}>
                {minuteText(s.startMin)} to {minuteText(s.endMin)}
              </span>
              <span className={styles.slotNote}>{s.note}</span>
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {slot && (
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onBlock(slot);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not block that time.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Block {minuteText(slot.startMin)} to {minuteText(slot.endMin)}
        </button>
      )}
      <button type="button" className={styles.ghost} onClick={() => router.push(`/tasks/${encodeURIComponent(row.id)}/edit`)}>
        <CalendarDays size={20} strokeWidth={2} aria-hidden />
        Pick another time
      </button>
    </Modal>
  );
}
