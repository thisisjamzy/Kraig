'use client';

// The Calendar's day timeline cards. Overlapping activities (grouped by
// viewmodels/dayLayout.ts) sit in side-by-side columns; when a group's
// columns can't each get MIN_CARD_WIDTH, it becomes a horizontal strip
// instead — each column 75% wide so the next one peeks in, snapping column
// by column — and only that strip scrolls sideways (the time gutter and
// the rest of the day stay put; a mostly vertical swipe still scrolls the
// day). A busy window (2+ activities) gets a pale tint and a count badge in
// the gutter. Cards never wrap: what they show depends on their height
// (TaskCheckRow's density).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TaskCheckRow, type TaskCheckRowTask } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import { GoogleEventCard, type GoogleCardEvent } from '@/src/widgets/GoogleEventCard/GoogleEventCard';
import { densityFor, type OverlapGroup } from '@/src/viewmodels/dayLayout';
import styles from './DayTimeline.module.css';

const MIN_CARD_WIDTH = 140;
const GAP = 6;
const STRIP_COLUMN = 0.75;
// Vertical breathing room between back-to-back cards.
const CARD_INSET = 2;
const NUDGE_KEY = 'dreda.calendarStripNudged';

interface TimelineLayout {
  column: number;
  columnCount: number;
  groupId: string;
  top: number;
  height: number;
  minutes: number;
  startMin: number;
  endMin: number;
}

/** A card on the timeline: an app task, or an event pulled from Google
 * Calendar (drawn by GoogleEventCard, same size rules). */
export type TimelineItem = TimelineLayout &
  (
    | (TaskCheckRowTask & { google?: undefined; projectName?: string | null; description?: string })
    | { id: string; google: GoogleCardEvent }
  );

function clock(min: number) {
  return `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;
}

function Card({ item, style }: { item: TimelineItem; style: CSSProperties }) {
  if (item.google) {
    return (
      <GoogleEventCard
        event={item.google}
        density={densityFor(item.minutes)}
        className={styles.card}
        style={{ ...style, height: Math.max(20, item.height - CARD_INSET * 2) }}
      />
    );
  }
  const detail = item.projectName || item.description?.split('\n')[0] || null;
  return (
    <TaskCheckRow
      task={{ ...item, context: detail }}
      timeOnly
      density={densityFor(item.minutes)}
      className={styles.card}
      style={{ ...style, height: Math.max(20, item.height - CARD_INSET * 2) }}
    />
  );
}

export function DayTimeline({ items, groups }: { items: TimelineItem[]; groups: OverlapGroup[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // The width the cards share: the screen minus the time gutter and padding.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const byId = new Map(items.map((item) => [item.id, item]));
  let nudgeUsed = false;

  return (
    <div ref={ref} className={styles.events}>
      {width > 0 &&
        groups.map((group) => {
          const members = group.itemIds.map((id) => byId.get(id)!).filter(Boolean);
          if (members.length === 1) {
            const item = members[0];
            return <Card key={group.id} item={item} style={{ top: item.top + CARD_INSET, left: 0, right: 0 }} />;
          }
          const fits = group.columnCount * MIN_CARD_WIDTH + (group.columnCount - 1) * GAP <= width;
          const nudge = !fits && !nudgeUsed;
          if (!fits) nudgeUsed = true;
          return <Group key={group.id} group={group} members={members} width={width} fits={fits} nudge={nudge} />;
        })}
    </div>
  );
}

function Group({
  group,
  members,
  width,
  fits,
  nudge,
}: {
  group: OverlapGroup;
  members: TimelineItem[];
  width: number;
  fits: boolean;
  nudge: boolean;
}) {
  const n = group.columnCount;
  const label = `${members.length} overlapping activities from ${clock(group.startMin)} to ${clock(group.endMin)}`;
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [nudging, setNudging] = useState(false);

  const column = fits ? (width - (n - 1) * GAP) / n : width * STRIP_COLUMN;
  const step = column + GAP;

  // First scrollable strip ever: slide it 24px left and back, once.
  useEffect(() => {
    if (fits || !nudge) return;
    try {
      if (localStorage.getItem(NUDGE_KEY)) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      localStorage.setItem(NUDGE_KEY, '1');
    } catch {
      return;
    }
    const start = requestAnimationFrame(() => setNudging(true));
    const stop = setTimeout(() => setNudging(false), 900);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(stop);
    };
  }, [fits, nudge]);

  function onScroll() {
    const el = stripRef.current;
    if (!el) return;
    setActive(Math.min(n - 1, Math.max(0, Math.round(el.scrollLeft / step))));
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2 });
  }
  function scrollToColumn(index: number) {
    stripRef.current?.scrollTo({ left: index * step, behavior: 'smooth' });
  }

  const cards = members.map((item) => (
    <Card
      key={item.id}
      item={item}
      style={{ top: item.top - group.top + CARD_INSET, left: item.column * step, width: column }}
    />
  ));

  const badge = fits ? (
    <span className={styles.badge} style={{ top: group.top }} aria-hidden>
      {members.length}
    </span>
  ) : (
    <button
      type="button"
      className={styles.badge}
      style={{ top: group.top }}
      onClick={() => scrollToColumn((active + 1) % n)}
      aria-label={`${label} — show the next one`}
    >
      {members.length}
    </button>
  );

  return (
    <>
      {badge}
      <div role="group" aria-label={label} className={styles.group} style={{ top: group.top, height: group.height }}>
        {fits ? (
          cards
        ) : (
          <div className={styles.stripWrap} data-at-start={edges.start || undefined} data-at-end={edges.end || undefined}>
            <div ref={stripRef} className={styles.strip} onScroll={onScroll}>
              <div className={styles.track} data-nudge={nudging || undefined} style={{ width: n * column + (n - 1) * GAP }}>
                {Array.from({ length: n }, (_, i) => (
                  <span key={i} className={styles.snap} style={{ left: i * step, width: column }} aria-hidden />
                ))}
                {cards}
              </div>
            </div>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowLeft}`}
              onClick={() => scrollToColumn(Math.max(0, active - 1))}
              aria-label="Previous activity"
              tabIndex={-1}
              hidden={edges.start}
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowRight}`}
              onClick={() => scrollToColumn(Math.min(n - 1, active + 1))}
              aria-label="Next activity"
              tabIndex={-1}
              hidden={edges.end}
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
            <span className={styles.dots} aria-hidden>
              {Array.from({ length: n }, (_, i) => (
                <span key={i} data-active={i === active || undefined} />
              ))}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
