'use client';

// A day or week time grid (Today's day timeline, the Calendar's Day and
// Week views).
//   - Hours from 07:00 (or the first item) to 20:00 (or the last item);
//     "Show full day" shows 00:00 to 24:00.
//   - All-day row: one line per item, up to 2 a day, then "+N more",
//     which opens the whole row in place.
//   - Blocks: a pale fill of their kind's tag color with a 3px left
//     accent (dashed for free tasks); the title at the top, on one line
//     when the block is narrower than 80px, else up to 2; the time under
//     it from 30 minutes; the project too on long blocks. Google events
//     carry a small "G".
//   - Overlaps: side by side. Day view: when the columns would be too
//     narrow, that group scrolls sideways as a strip. Week view: two side
//     by side, then a "+N" chip listing the slot.
//   - Mouse: hover shows a preview card; drag a task to move it, drag its
//     bottom edge to resize (15-minute steps). A task dragged in from a
//     list drops onto the time under the pointer. Touch: tap opens.
//   - Today: a red line with a dot at the current time; the grid scrolls
//     to it when it opens.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNowMinute } from '@/src/shared/insights/useNow';
import {
  NARROW_BLOCK_PX,
  allDayLines,
  dayFromIso,
  hourRange,
  placeDay,
  snapMinutes,
  spanOn,
  type CalItem,
  type PlacedItem,
} from '@/src/viewmodels/calendarItems';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import styles from './TimeCalendar.module.css';

export const TASK_DRAG_TYPE = 'application/x-dreda-task';

const DAY_MIN_COLUMN = 140;
const WEEK_MAX_COLUMNS = 2;

function hhmm(min: number) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export interface TimeGridProps {
  mode: 'day' | 'week';
  days: string[];
  itemsOn: (iso: string) => CalItem[];
  today: string;
  /** The day highlighted in the week header. */
  selected?: string;
  onPickDay?: (iso: string) => void;
  onOpen: (item: CalItem) => void;
  /** Clicking an empty slot (new task there). */
  onEmpty?: (iso: string, minute: number) => void;
  /** A task moved or resized on the grid. */
  onMove?: (item: CalItem, iso: string, startMin: number, endMin: number) => Promise<unknown> | void;
  /** A task dropped from a list. */
  onDropTask?: (taskId: string, iso: string, minute: number) => Promise<unknown> | void;
  /** Ringed (hovered in a list). */
  highlight?: string | null;
  onHover?: (key: string | null) => void;
  hourHeight?: number;
  /** Max height before the grid scrolls (CSS length). */
  maxHeight?: string;
  /** Week view narrower than this per day draws bars with titles on hover or tap. */
  barsBelow?: number;
}

export function TimeGrid(props: TimeGridProps) {
  const { mode, days, itemsOn, today, hourHeight = mode === 'day' ? 56 : 48 } = props;
  const { finePointer } = useLayout();
  const [fullDay, setFullDay] = useState(false);
  const [allDayOpen, setAllDayOpen] = useState(false);
  const [preview, setPreview] = useState<{ item: CalItem; top: number; left: number } | null>(null);
  const [slotList, setSlotList] = useState<{ items: PlacedItem[]; anchor: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<{ key: string; iso: string; startMin: number; endMin: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ iso: string; minute: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);
  const hoverTimer = useRef<number | null>(null);
  const minute = useNowMinute();

  const perDay = days.map((iso) => ({ iso, items: itemsOn(iso) }));
  const spans = perDay.flatMap(({ iso, items }) => items.filter((i) => !i.allDay).map((i) => spanOn(i, iso)).filter((s): s is NonNullable<typeof s> => s !== null));
  const { first, last } = hourRange(spans, fullDay);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const height = (last - first) * hourHeight;
  const px = (min: number) => ((min - first * 60) / 60) * hourHeight;

  const now = new Date(minute * 60000);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIndex = days.indexOf(today);
  const showNow = todayIndex >= 0 && nowMin >= first * 60 && nowMin <= last * 60;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setColWidth(el.clientWidth / days.length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [days.length]);

  // Open at the current time (today) or the first item.
  const firstKey = days.join(',');
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstItem = Math.min(...spans.map((s) => s.startMin), 24 * 60);
    const target = showNow ? px(nowMin) : firstItem < 24 * 60 ? px(firstItem) : 0;
    el.scrollTo({ top: Math.max(0, target - 80) });
    // Only when the days shown change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey]);

  async function run(fn: () => Promise<unknown> | void) {
    setError(null);
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move that.');
    }
  }

  function minuteAt(clientY: number) {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return first * 60 + ((clientY - rect.top) / hourHeight) * 60;
  }
  function dayAt(clientX: number) {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect || !colWidth) return days[0];
    return days[Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left) / colWidth)))];
  }

  // ---- Dragging a task on the grid (mouse only) ----
  function startDrag(e: React.PointerEvent, p: PlacedItem, iso: string, resize: boolean) {
    if (!finePointer || e.button !== 0 || !p.item.taskId || !props.onMove) return;
    e.preventDefault();
    const startY = e.clientY;
    const startX = e.clientX;
    let moved = false;
    let current = { key: p.item.key, iso, startMin: p.startMin, endMin: p.endMin };
    const onMoveEvt = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) < 4 && Math.abs(ev.clientX - startX) < 4) return;
      moved = true;
      const delta = snapMinutes((dy / hourHeight) * 60);
      if (resize) {
        current = { ...current, endMin: Math.max(p.startMin + 15, Math.min(24 * 60, p.endMin + delta)) };
      } else {
        const len = p.endMin - p.startMin;
        const start = Math.max(0, Math.min(24 * 60 - len, p.startMin + delta));
        current = { key: p.item.key, iso: mode === 'week' ? dayAt(ev.clientX) : iso, startMin: start, endMin: start + len };
      }
      setDrag(current);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (!moved) {
        props.onOpen(p.item);
        return;
      }
      if (current.iso !== iso || current.startMin !== p.startMin || current.endMin !== p.endMin) {
        void run(() => props.onMove!(p.item, current.iso, current.startMin, current.endMin));
      }
    };
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
  }

  function hoverIn(item: CalItem, el: HTMLElement) {
    props.onHover?.(item.taskId ?? item.key);
    if (!finePointer) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const left = r.right + 268 < window.innerWidth ? r.right + 8 : Math.max(8, r.left - 268);
      setPreview({ item, top: Math.max(8, Math.min(window.innerHeight - 160, r.top)), left });
    }, 450);
  }
  function hoverOut() {
    props.onHover?.(null);
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreview(null);
  }

  function block(p: PlacedItem, iso: string, style: CSSProperties, width: number): ReactNode {
    const live = drag?.key === p.item.key ? drag : null;
    const startMin = live ? live.startMin : p.startMin;
    const endMin = live ? live.endMin : p.endMin;
    if (live && live.iso !== iso) return null;
    const top = px(startMin);
    const h = Math.max(20, px(endMin) - top - 2);
    const minutes = endMin - startMin;
    const narrow = width < NARROW_BLOCK_PX;
    const bar = props.barsBelow !== undefined && mode === 'week' && colWidth < props.barsBelow;
    const lit = props.highlight !== undefined && props.highlight !== null && (props.highlight === p.item.taskId || props.highlight === p.item.key);
    return (
      <div
        key={p.item.key}
        role="button"
        tabIndex={0}
        className={styles.block}
        data-kind={p.item.kind}
        data-free={p.item.free || undefined}
        data-done={p.item.done || undefined}
        data-narrow={narrow || undefined}
        data-bar={bar || undefined}
        data-lit={lit || undefined}
        data-dragging={live ? true : undefined}
        style={{ ...style, top: top + 1, height: h }}
        aria-label={`${p.item.title}, ${hhmm(startMin)} to ${hhmm(endMin)}`}
        onPointerDown={(e) => startDrag(e, p, iso, false)}
        onClick={(e) => {
          // Mouse clicks open from the pointer handler (it tells a click from a drag).
          if (finePointer && p.item.taskId && props.onMove) return;
          e.stopPropagation();
          props.onOpen(p.item);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') props.onOpen(p.item);
        }}
        onMouseEnter={(e) => hoverIn(p.item, e.currentTarget)}
        onMouseLeave={hoverOut}
      >
        {!bar && (
          <>
            <span className={styles.blockTitle}>
              {p.item.kind === 'google' && <span className={styles.gBadge}>G</span>}
              {p.item.title}
            </span>
            {minutes >= 30 && !narrow && (
              <span className={styles.blockTime}>
                {hhmm(startMin)} to {hhmm(endMin)}
              </span>
            )}
            {minutes >= 75 && !narrow && p.item.project && <span className={styles.blockProject}>{p.item.project}</span>}
          </>
        )}
        {finePointer && p.item.taskId && props.onMove && (
          <span
            className={styles.resize}
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag(e, p, iso, true);
            }}
            aria-hidden
          />
        )}
      </div>
    );
  }

  function dayColumn(iso: string, items: CalItem[]) {
    const { placed, groups } = placeDay(items, iso, first, hourHeight);
    const byKey = new Map(placed.map((p) => [p.item.key, p]));
    const width = colWidth || 600;
    const isDropTarget = dropAt?.iso === iso;
    // A dragged task from another day of the week lands here.
    const incoming = drag && drag.iso === iso && !placed.some((p) => p.item.key === drag.key) ? perDay.flatMap((d) => placeDay(d.items, d.iso, first, hourHeight).placed).find((p) => p.item.key === drag.key) : null;
    return (
      <div
        key={iso}
        className={styles.column}
        data-today={iso === today || undefined}
        onClick={(e) => {
          if (e.target !== e.currentTarget || !props.onEmpty) return;
          props.onEmpty(iso, Math.floor(minuteAt(e.clientY) / 30) * 30);
        }}
        onDragOver={(e) => {
          if (!props.onDropTask || !e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
          e.preventDefault();
          setDropAt({ iso, minute: snapMinutes(minuteAt(e.clientY), 30) });
        }}
        onDragLeave={() => setDropAt(null)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
          setDropAt(null);
          if (!id || !props.onDropTask) return;
          e.preventDefault();
          const at = snapMinutes(minuteAt(e.clientY), 30);
          void run(() => props.onDropTask!(id, iso, at));
        }}
        role="presentation"
      >
        {hours.map((h) => (
          <span key={h} className={styles.hourLine} style={{ top: (h - first) * hourHeight }} aria-hidden />
        ))}
        {isDropTarget && <span className={styles.dropMark} style={{ top: px(dropAt.minute) }} aria-hidden>{hhmm(dropAt.minute)}</span>}
        {groups.map((group) => {
          const members = group.itemIds.map((id) => byKey.get(id)!).filter(Boolean);
          if (members.length === 1) return block(members[0], iso, { left: 2, right: 4 }, width - 6);
          if (mode === 'week') {
            const cols = Math.min(group.columnCount, WEEK_MAX_COLUMNS);
            const shown = members.filter((m) => m.column < cols);
            const hidden = members.length - shown.length;
            const w = 100 / (hidden > 0 ? cols + 0.5 : cols);
            return (
              <div key={group.id}>
                {shown.map((m) => block(m, iso, { left: `calc(${m.column * w}% + 2px)`, width: `calc(${w}% - 4px)` }, (width * w) / 100 - 4))}
                {hidden > 0 && (
                  <button
                    type="button"
                    className={styles.plusChip}
                    style={{ top: group.top + 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlotList({ items: members, anchor: e.currentTarget });
                    }}
                    aria-label={`${hidden} more at ${hhmm(group.startMin)}`}
                  >
                    +{hidden}
                  </button>
                )}
              </div>
            );
          }
          const n = group.columnCount;
          const fits = n * DAY_MIN_COLUMN <= width;
          if (fits) {
            const w = 100 / n;
            return <div key={group.id}>{members.map((m) => block(m, iso, { left: `calc(${m.column * w}% + 2px)`, width: `calc(${w}% - 4px)` }, (width * w) / 100 - 4))}</div>;
          }
          // Too narrow: this group scrolls sideways, each column 75% wide.
          const col = width * 0.75;
          return (
            <div key={group.id} className={styles.stripGroup} style={{ top: group.top, height: group.height + 2 }} role="group" aria-label={`${members.length} overlapping items`}>
              <div className={styles.stripTrack} style={{ width: n * (col + 6), height: group.height + 2 }}>
                {members.map((m) => block(m, iso, { left: m.column * (col + 6), width: col, marginTop: -group.top }, col))}
              </div>
            </div>
          );
        })}
        {incoming && block(incoming, iso, { left: 2, right: 4 }, width - 6)}
        {showNow && iso === today && (
          <div className={styles.nowLine} style={{ top: px(nowMin) }} role="img" aria-label={`Now, ${hhmm(nowMin)}`}>
            <span className={styles.nowDot} />
          </div>
        )}
      </div>
    );
  }

  const allDay = perDay.map(({ iso, items }) => ({ iso, items: items.filter((i) => i.allDay) }));
  const hasAllDay = allDay.some((d) => d.items.length > 0);
  const anyMore = allDay.some((d) => d.items.length > 2);

  return (
    <div className={styles.grid} data-mode={mode}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {mode === 'week' && (
        <div className={styles.weekHead} style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
          <span />
          {days.map((iso) => {
            const d = dayFromIso(iso);
            return (
              <button
                key={iso}
                type="button"
                className={styles.weekHeadDay}
                aria-pressed={iso === props.selected}
                data-today={iso === today || undefined}
                onClick={() => props.onPickDay?.(iso)}
              >
                <span>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                <span className={styles.weekHeadNum}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      )}
      {hasAllDay && (
        <div className={styles.allDay} style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
          <span className={styles.allDayLabel}>All day</span>
          {allDay.map(({ iso, items }) => {
            const { shown, more } = allDayLines(items, allDayOpen);
            return (
              <div key={iso} className={styles.allDayCell}>
                {shown.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    className={styles.allDayItem}
                    data-kind={i.kind}
                    data-done={i.done || undefined}
                    title={i.title}
                    onClick={() => props.onOpen(i)}
                    onMouseEnter={(e) => hoverIn(i, e.currentTarget)}
                    onMouseLeave={hoverOut}
                  >
                    {i.kind === 'google' && <span className={styles.gBadge}>G</span>}
                    <span className={styles.allDayText}>{i.title}</span>
                  </button>
                ))}
                {more > 0 && (
                  <button type="button" className={styles.allDayMore} onClick={() => setAllDayOpen(true)}>
                    +{more} more
                  </button>
                )}
              </div>
            );
          })}
          {allDayOpen && anyMore && (
            <button type="button" className={styles.allDayLess} onClick={() => setAllDayOpen(false)}>
              Show less
            </button>
          )}
        </div>
      )}
      <div ref={scrollRef} className={styles.scroller} style={{ maxHeight: props.maxHeight }}>
        <div className={styles.body} style={{ height, gridTemplateColumns: `52px minmax(0, 1fr)` }}>
          <div className={styles.gutter} aria-hidden>
            {hours.map((h) => (
              <span key={h} className={styles.hourLabel} style={{ top: (h - first) * hourHeight }}>
                {hhmm(h * 60)}
              </span>
            ))}
          </div>
          <div ref={bodyRef} className={styles.columns} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {perDay.map(({ iso, items }) => dayColumn(iso, items))}
          </div>
        </div>
      </div>
      <div className={styles.gridFoot}>
        <button type="button" className={styles.textButton} onClick={() => setFullDay((f) => !f)} aria-pressed={fullDay}>
          {fullDay ? 'Show working hours' : 'Show full day'}
        </button>
      </div>

      {preview && (
        <div className={styles.previewFloat} style={{ top: preview.top, left: preview.left }} role="tooltip">
          <PreviewCard item={preview.item} />
        </div>
      )}
      {slotList && (
        <Popover anchor={slotList.anchor} label="Everything in this slot" onClose={() => setSlotList(null)}>
          <div className={styles.slotList}>
            {slotList.items.map((p) => (
              <button
                key={p.item.key}
                type="button"
                className={styles.slotRow}
                data-kind={p.item.kind}
                onClick={() => {
                  setSlotList(null);
                  props.onOpen(p.item);
                }}
              >
                <span className={styles.blockTime}>
                  {hhmm(p.startMin)} to {hhmm(p.endMin)}
                </span>
                <span className={styles.slotTitle}>
                  {p.item.kind === 'google' && <span className={styles.gBadge}>G</span>}
                  {p.item.title}
                </span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

export function PreviewCard({ item }: { item: CalItem }) {
  const time =
    item.allDay || !item.start
      ? 'All day'
      : `${item.start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${item.end ? ` to ${item.end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
  return (
    <div className={styles.preview} data-kind={item.kind}>
      <p className={styles.previewTitle}>{item.title}</p>
      <p className={styles.previewMeta}>{time}</p>
      {item.project && <p className={styles.previewMeta}>{item.project}</p>}
      {item.attendees.length > 0 && <p className={styles.previewMeta}>With {item.attendees.slice(0, 4).join(', ')}{item.attendees.length > 4 ? ` and ${item.attendees.length - 4} more` : ''}</p>}
    </div>
  );
}
