// The staggered grid's placement, pure (MasonryGrid.tsx renders it).
// Tested in test/planForecast.test.ts.

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
