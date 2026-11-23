// Transfer and withdrawal fees per wallet (owner, 23 Nov 2026). The user
// keeps a wallet's schedule of fee bands; the app applies it. Pure: no
// Firestore, no React, so the bands can be tested at their edges.

import type { FeeBand, FeeKind, FeeSchedule } from '@/src/shared/firestore/types';

/** Who pays fees when a schedule does not say: transfers and withdrawals. */
export const DEFAULT_FEE_APPLIES_TO: FeeKind[] = ['transfer', 'withdrawal'];

/** The band an amount falls in: inclusive of `min`, exclusive of `max`. */
export function bandFor(bands: FeeBand[], amount: number): FeeBand | null {
  for (const b of bands) {
    if (amount >= b.min && (b.max === null || amount < b.max)) return b;
  }
  return null;
}

/** The fee a wallet charges for moving `amount` out as `kind`, or 0 when it
 *  has no schedule, the schedule does not cover that kind, or no band holds
 *  the amount. A percent fee is rounded to the nearest whole unit. */
export function feeFor(
  wallet: { feeSchedule?: FeeSchedule | null } | null | undefined,
  amount: number,
  kind: FeeKind
): number {
  const schedule = wallet?.feeSchedule;
  if (!schedule || !(amount > 0)) return 0;
  const applies = schedule.appliesTo?.length ? schedule.appliesTo : DEFAULT_FEE_APPLIES_TO;
  if (!applies.includes(kind)) return 0;
  const band = bandFor(schedule.bands ?? [], amount);
  if (!band) return 0;
  const fee = band.kind === 'percent' ? (amount * band.fee) / 100 : band.fee;
  return Math.max(0, Math.round(fee));
}

/** Whether a wallet's schedule would set a fee for this kind of move. */
export function hasFeesFor(wallet: { feeSchedule?: FeeSchedule | null } | null | undefined, kind: FeeKind): boolean {
  const schedule = wallet?.feeSchedule;
  if (!schedule || !schedule.bands?.length) return false;
  const applies = schedule.appliesTo?.length ? schedule.appliesTo : DEFAULT_FEE_APPLIES_TO;
  return applies.includes(kind);
}

/** The first problem with a set of bands, in words, or null when they are
 *  sorted, start at 0, leave no gap, do not overlap, only the last is "and
 *  above", and no fee is negative. */
export function validateBands(bands: FeeBand[]): string | null {
  if (bands.length === 0) return 'Add at least one band.';
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const row = `Row ${i + 1}`;
    if (!Number.isFinite(b.min) || b.min < 0) return `${row}: "From" must be 0 or more.`;
    if (b.max !== null && !(b.max > b.min)) return `${row}: "To" must be more than "From".`;
    if (!Number.isFinite(b.fee) || b.fee < 0) return `${row}: the fee can't be negative.`;
    if (b.kind === 'percent' && b.fee > 100) return `${row}: a percentage fee can't be more than 100%.`;
    if (i === 0 && b.min !== 0) return 'The first band must start at 0.';
    if (i > 0) {
      const prev = bands[i - 1];
      if (prev.max === null) return `Row ${i}: only the last band can be "and above".`;
      if (b.min < prev.max) return `Rows ${i} and ${i + 1} overlap.`;
      if (b.min > prev.max) return `There is a gap between rows ${i} and ${i + 1}.`;
    }
  }
  return null;
}

/** Bands as typed in the form (text fields) to numbers; blank "To" is "and above". */
export function parseBands(rows: { min: string; max: string; fee: string; kind: 'fixed' | 'percent' }[]): FeeBand[] {
  const num = (v: string) => Number(v.replace(/[^0-9.]/g, ''));
  return rows.map((r) => ({
    min: r.min.trim() === '' ? NaN : num(r.min),
    max: r.max.trim() === '' ? null : num(r.max),
    fee: r.fee.trim() === '' ? NaN : num(r.fee),
    kind: r.kind,
  }));
}
