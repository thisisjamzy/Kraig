'use client';

// The phone's hour grid (Dreda v1.0 `Calendar / Phone / Day` 67699), for
// one day or a week: hour labels, blocks on their label hues with the bar
// on the top edge, overlaps side by side, all-day items above, and the now
// line with the time on a lime chip. Tap a block to open it, an empty
// half hour to add a task there. Layout rules are viewmodels/calendarItems.

import type { CSSProperties } from 'react';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { hourRange, placeDay, spanOn, type CalItem } from '@/src/viewmodels/calendarItems';
import { minuteText } from '@/src/viewmodels/todayPlan';
import styles from '@/src/phone/widgets/DayGrid/DayGrid.module.css';

export function DayGrid({
  days,
  itemsOn,
  today,
  onOpen,
  onEmpty,
  hourHeight = 56,
}: {
  days: string[];
  itemsOn: (iso: string) => CalItem[];
  today: string;
  onOpen: (item: CalItem) => void;
  onEmpty?: (iso: string, minute: number) => void;
  hourHeight?: number;
}) {
  const minute = useNowMinute();
  const perDay = days.map((iso) => ({ iso, items: itemsOn(iso) }));
  const spans = perDay.flatMap(({ iso, items }) => items.filter((i) => !i.allDay).map((i) => spanOn(i, iso)).filter((s): s is NonNullable<typeof s> => s !== null));
  const { first, last } = hourRange(spans, false);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const px = (min: number) => ((min - first * 60) / 60) * hourHeight;
  const now = new Date(minute * 60000);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIndex = days.indexOf(today);
  const showNow = todayIndex >= 0 && nowMin >= first * 60 && nowMin <= last * 60;
  const week = days.length > 1;
  const allDay = perDay.filter((d) => d.items.some((i) => i.allDay));

  return (
    <div className={styles.grid} data-week={week || undefined}>
      {allDay.length > 0 && (
        <div className={styles.allDay}>
          {perDay.flatMap(({ items }) =>
            items
              .filter((i) => i.allDay)
              .map((i) => (
                <button key={i.key} type="button" className={styles.allDayItem} data-hue={i.hue ?? 'grey'} onClick={() => onOpen(i)}>
                  {i.title}
                </button>
              ))
          )}
        </div>
      )}
      <div className={styles.body} style={{ height: (last - first) * hourHeight }}>
        <div className={styles.gutter} aria-hidden>
          {hours.map((h) => (
            <span key={h} className={styles.hour} style={{ top: (h - first) * hourHeight }}>
              {minuteText(h * 60)}
            </span>
          ))}
          {showNow && (
            <span className={styles.nowChip} style={{ top: px(nowMin) }}>
              {minuteText(nowMin)}
            </span>
          )}
        </div>
        <div className={styles.columns} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {perDay.map(({ iso, items }) => {
            const { placed } = placeDay(items, iso, first, hourHeight);
            return (
              <div
                key={iso}
                className={styles.column}
                onClick={(e) => {
                  if (e.target !== e.currentTarget || !onEmpty) return;
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  onEmpty(iso, Math.floor((first * 60 + (y / hourHeight) * 60) / 30) * 30);
                }}
                role="presentation"
              >
                {hours.map((h) => (
                  <span key={h} className={styles.line} style={{ top: (h - first) * hourHeight }} aria-hidden />
                ))}
                {placed.map((p) => {
                  const w = 100 / p.columnCount;
                  const style: CSSProperties = { top: p.top + 1, height: Math.max(20, p.height - 3), left: `calc(${p.column * w}% + 2px)`, width: `calc(${w}% - 4px)` };
                  const minutes = p.endMin - p.startMin;
                  return (
                    <button
                      key={p.item.key}
                      type="button"
                      className={styles.block}
                      data-hue={p.item.hue ?? 'grey'}
                      data-free={p.item.free || undefined}
                      data-done={p.item.done || undefined}
                      style={style}
                      aria-label={`${p.item.title}, ${minuteText(p.startMin)} to ${minuteText(p.endMin)}`}
                      onClick={() => onOpen(p.item)}
                    >
                      <span className={styles.title}>
                        {p.item.title}
                        {p.item.done && !week ? ', done' : ''}
                      </span>
                      {minutes >= 45 && !week && (
                        <span className={styles.time}>
                          {minuteText(p.startMin)} to {minuteText(p.endMin)}
                          {p.item.project ? ` · ${p.item.project}` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {showNow && <span className={styles.nowLine} style={{ top: px(nowMin), width: `${((todayIndex + 1) / days.length) * 100}%` }} aria-hidden />}
        </div>
      </div>
    </div>
  );
}
