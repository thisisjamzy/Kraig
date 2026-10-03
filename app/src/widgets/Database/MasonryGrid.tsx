'use client';

// A staggered (masonry) grid for dashboards: 1 column below 900px of
// content width, 2 from 900px, 3 from 1500px. Each block keeps its natural
// height and goes into the shortest column, in reading order, so blocks of
// different heights leave no gaps. A wide block spans 2 columns (the full
// width when there are only 2, a normal block when there's 1); before one
// is placed, following single blocks fill any column it would otherwise
// leave short, so it doesn't open a hole. Re-lays out whenever the grid or
// any block changes size (resize, a section collapsing, data arriving).

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './MasonryGrid.module.css';

export interface MasonryItem {
  id: string;
  /** 2 for a wide block. */
  span?: 1 | 2;
  node: ReactNode;
}

export function columnsFor(width: number): number {
  if (width >= 1500) return 3;
  if (width >= 900) return 2;
  return 1;
}

interface Placement {
  col: number;
  span: number;
  y: number;
}

/**
 * Pure placement: heights in reading order, column count, gap → each
 * block's column, span and top. Exported for tests.
 */
export function placeBlocks(items: { id: string; span: number; height: number }[], cols: number, gap: number): { places: Map<string, Placement>; height: number } {
  const h = new Array(cols).fill(0);
  const places = new Map<string, Placement>();
  const queue = [...items];
  while (queue.length) {
    const item = queue.shift()!;
    const span = Math.min(item.span, cols);
    // Best start column: the lowest top for the span.
    let best = 0;
    let bestTop = Infinity;
    for (let c = 0; c <= cols - span; c++) {
      const top = Math.max(...h.slice(c, c + span));
      if (top < bestTop - 0.5) {
        best = c;
        bestTop = top;
      }
    }
    if (span > 1) {
      // Fill short columns under the wide block with following single blocks that fit.
      for (let c = best; c < best + span; c++) {
        let i = 0;
        while (i < queue.length) {
          const next = queue[i];
          if (Math.min(next.span, cols) === 1 && h[c] + next.height <= bestTop + 0.5) {
            places.set(next.id, { col: c, span: 1, y: h[c] });
            h[c] += next.height + gap;
            queue.splice(i, 1);
          } else i += 1;
        }
      }
      bestTop = Math.max(...h.slice(best, best + span));
    }
    places.set(item.id, { col: best, span, y: bestTop });
    for (let c = best; c < best + span; c++) h[c] = bestTop + item.height + gap;
  }
  return { places, height: Math.max(0, ...h.map((v) => v - gap)) };
}

export function MasonryGrid({ items, gap = 16, label }: { items: MasonryItem[]; gap?: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      const next: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>('[data-masonry-id]').forEach((child) => {
        next[child.dataset.masonryId!] = child.offsetHeight;
      });
      setHeights((prev) => {
        const same = Object.keys(next).length === Object.keys(prev).length && Object.entries(next).every(([k, v]) => prev[k] === v);
        return same ? prev : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll<HTMLElement>('[data-masonry-id]').forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [items]);

  const cols = columnsFor(width);
  const colWidth = cols > 0 ? (width - gap * (cols - 1)) / cols : width;
  const measured = width > 0 && items.every((i) => heights[i.id] !== undefined);
  const { places, height } = placeBlocks(
    items.map((i) => ({ id: i.id, span: i.span ?? 1, height: heights[i.id] ?? 0 })),
    cols,
    gap
  );

  return (
    <div ref={ref} className={styles.grid} style={{ height: measured ? height : undefined }} data-ready={measured || undefined} aria-label={label}>
      {items.map((item) => {
        const p = places.get(item.id);
        const span = p?.span ?? 1;
        const pending = Math.min(item.span ?? 1, cols);
        const style =
          measured && p
            ? { left: p.col * (colWidth + gap), top: p.y, width: colWidth * span + gap * (span - 1) }
            : width > 0
              ? { width: colWidth * pending + gap * (pending - 1) }
              : undefined;
        return (
          <div key={item.id} data-masonry-id={item.id} className={styles.item} style={style}>
            {item.node}
          </div>
        );
      })}
    </div>
  );
}
