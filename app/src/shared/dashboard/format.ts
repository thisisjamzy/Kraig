// The dashboards' one formatting module: every number on them goes through
// here. Currency with grouped thousands and no decimals ("XAF 472,000"),
// compact values inside charts ("472k", "1.4M"), hours ("38.5 h", "52 min"),
// and a real minus sign ("−32k"). Pure.

const MINUS = '−';
const sign = (n: number) => (n < 0 ? MINUS : '');
const trim = (s: string) => s.replace(/\.0$/, '');

/** "XAF 472,000", "XAF −12,500". */
export function money(n: number, currency: string): string {
  return `${currency} ${sign(n)}${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

/** "472,000" (no currency). */
export function amount(n: number): string {
  return `${sign(n)}${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

/** Inside charts: "850", "472k", "1.4M". */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return `${sign(n)}${Math.round(a)}`;
  if (a < 1_000_000) return `${sign(n)}${trim((a / 1000).toFixed(a < 10_000 ? 1 : 0))}k`;
  return `${sign(n)}${trim((a / 1_000_000).toFixed(1))}M`;
}

/** "+5k", "−10k", "0". */
export function signedCompact(n: number): string {
  if (Math.abs(n) < 0.5) return '0';
  return n > 0 ? `+${compact(n)}` : compact(n);
}

/** "+6,000", "−4,000". */
export function signedAmount(n: number): string {
  return n > 0 ? `+${amount(n)}` : amount(n);
}

/** Minutes as hours: "38.5 h", "1,439 h"; under an hour "52 min". */
export function hours(minutes: number): string {
  const m = Math.max(0, minutes);
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return `${trim(h >= 100 ? Math.round(h).toLocaleString('en-US') : h.toFixed(1))} h`;
}

/** "2 h 30 min", "45 min", "3 h". */
export function duration(minutes: number): string {
  const m = Math.round(Math.max(0, minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "17.6%". */
export function percent(fraction: number, digits = 1): string {
  return `${sign(fraction)}${trim((Math.abs(fraction) * 100).toFixed(digits))}%`;
}

/** Value for an axis tick given a unit kind. */
export function tick(n: number, unit: 'money' | 'hours' | 'count' | 'percent'): string {
  if (unit === 'hours') return `${trim((n / 60).toFixed(n / 60 < 10 && n % 60 ? 1 : 0))} h`;
  if (unit === 'percent') return `${trim(n.toFixed(1))}%`;
  if (unit === 'count') return String(Math.round(n));
  return compact(n);
}
