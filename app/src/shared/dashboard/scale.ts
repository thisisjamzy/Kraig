// Chart scales for the dashboards: a round linear scale (a step near a
// third of the largest value, 1, 2, 2.5 or 5 × 10ⁿ, topped at the first step
// above 108% of it) and a log scale (powers of ten), so every chart can be
// read either way. `pos` turns a value into a percentage of the plot.
// Values at or below zero sit on the floor of a log scale. Pure: tested in
// test/dashboard.test.ts.

export type ScaleMode = 'linear' | 'log';

export interface Scale {
  mode: ScaleMode;
  min: number;
  max: number;
  ticks: number[];
  /** 0 to 100, from the floor of the plot. */
  pos: (value: number) => number;
}

export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= raw) return m * base;
  return 10 * base;
}

/** A linear scale from `minValue` (0 unless negatives) to just above `maxValue`. */
export function linearScale(maxValue: number, minValue = 0): Scale {
  const hi = Math.max(0, maxValue);
  const lo = Math.min(0, minValue);
  const span = hi - lo || 1;
  const step = niceStep(span / 3);
  const max = hi > 0 ? Math.ceil((hi * 1.08) / step) * step : 0;
  const min = lo < 0 ? Math.floor((lo * 1.08) / step) * step : 0;
  const top = max === min ? min + step : max;
  const ticks: number[] = [];
  for (let v = min; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { mode: 'linear', min, max: top, ticks, pos: (v) => ((v - min) / (top - min)) * 100 };
}

/** A log scale in powers of ten covering the positive values. */
export function logScale(maxValue: number, minPositive?: number): Scale {
  const hi = Math.max(1, maxValue);
  const lowExp = Math.floor(Math.log10(Math.max(1, minPositive && minPositive > 0 ? minPositive : 1)));
  let highExp = Math.ceil(Math.log10(hi * 1.08));
  if (highExp <= lowExp) highExp = lowExp + 1;
  const min = 10 ** lowExp;
  const max = 10 ** highExp;
  const ticks: number[] = [];
  for (let e = lowExp; e <= highExp; e++) ticks.push(10 ** e);
  const lmin = Math.log10(min);
  const lmax = Math.log10(max);
  return {
    mode: 'log',
    min,
    max,
    ticks,
    pos: (v) => (v <= min ? 0 : ((Math.log10(Math.min(v, max)) - lmin) / (lmax - lmin)) * 100),
  };
}

/** The scale a chart needs for these values in this mode. */
export function makeScale(values: (number | null | undefined)[], mode: ScaleMode, allowNegative = false): Scale {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const max = nums.length ? Math.max(...nums) : 0;
  if (mode === 'log') {
    const positives = nums.filter((v) => v > 0);
    return logScale(max, positives.length ? Math.min(...positives) : 1);
  }
  return linearScale(max, allowNegative && nums.length ? Math.min(...nums) : 0);
}
