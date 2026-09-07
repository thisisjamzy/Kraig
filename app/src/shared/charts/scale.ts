// Shared bar-height/axis-label math for every bar chart's optional log-scale
// toggle. A single outlier (e.g. one month's rent dwarfing every other
// category) otherwise flattens every smaller bar to a sliver against a
// plain linear axis; switching to log scale keeps small-but-real values
// visibly different from zero without hiding how much bigger the outlier
// still is. log1p/expm1 (not plain log/exp) handle a zero value safely —
// Math.log(0) is -Infinity, but Math.log1p(0) is exactly 0.

export function barHeightPercent(value: number, max: number, logScale: boolean, minPercent = 2): number {
  if (max <= 0 || value <= 0) return 0;
  const ratio = logScale ? Math.log1p(value) / Math.log1p(max) : value / max;
  return Math.max(ratio * 100, minPercent);
}

// Inverse of the ratio above — the value that would sit at this fraction of
// the axis, for rendering axis labels (e.g. the "half" tick shows a much
// smaller number under log scale than under linear, by design).
export function axisValueAt(fraction: number, max: number, logScale: boolean): number {
  if (max <= 0) return 0;
  return logScale ? Math.expm1(fraction * Math.log1p(max)) : max * fraction;
}
