// The chart kit's pure maths, kept apart from the components (and their
// styles) so tests can use it: box plot quartiles, label spacing, waterfall
// spans and text colour on a fill.

import type { WaterfallStep } from './Lists';

export interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

/** Quartiles with linear interpolation. */
export function boxStats(values: number[]): BoxStats | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { min: v[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: v[v.length - 1] };
}

/** White text on the dark brand fills, near-black on the light ones. */
export function textOn(fill: string): string {
  return fill === 'var(--c-primary)' || fill === 'var(--c-primary-dark)' ? '#ffffff' : '#111827';
}

/** Whether text on a fill of this strength (0 to 1 towards the dark end) should be white. */
export const whiteOn = (strength: number) => strength > 0.55;

/** Label centres (percent of height) at least `gap` apart, kept inside 0 to 100. */
export function spreadLabels(centres: number[], gap = 8.5): number[] {
  const out = [...centres];
  for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < gap) out[i] = out[i - 1] + gap;
  const overflow = out.length ? out[out.length - 1] - (100 - gap / 2) : 0;
  if (overflow > 0) {
    out[out.length - 1] -= overflow;
    for (let i = out.length - 2; i >= 0; i--) if (out[i + 1] - out[i] < gap) out[i] = out[i + 1] - gap;
  }
  return out.map((v) => Math.max(gap / 2, v));
}

/** Where each bar starts and ends: totals from zero, changes from the running total. */
export function waterfallSpans(steps: WaterfallStep[]) {
  const out: { step: WaterfallStep; from: number; to: number }[] = [];
  let running = 0;
  for (const step of steps) {
    if (step.kind === 'total') {
      running = step.value;
      out.push({ step, from: Math.min(0, step.value), to: Math.max(0, step.value) });
      continue;
    }
    const from = running;
    running += step.value;
    out.push({ step, from: Math.min(from, running), to: Math.max(from, running) });
  }
  return out;
}
