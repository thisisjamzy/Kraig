// How a reconciliation gap reads. A gap is the ledger less what was
// reported: above zero, money the ledger expected that isn't there
// (missing); below zero, more money than the ledger expected (a surplus).
// A surplus is never shown as a negative gap or a negative unaccounted
// balance: it reads as a surplus, the amount always positive. The same
// for the unaccounted balance, which nets the two over time.

export type GapKind = 'missing' | 'surplus' | 'none';

export interface GapReading {
  kind: GapKind;
  /** Always zero or more. */
  amount: number;
  /** "Missing", "Surplus" or "Matches". */
  label: string;
}

export function readGap(gap: number): GapReading {
  const amount = Math.round(Math.abs(gap) * 100) / 100;
  if (amount < 0.005) return { kind: 'none', amount: 0, label: 'Matches' };
  return gap > 0 ? { kind: 'missing', amount, label: 'Missing' } : { kind: 'surplus', amount, label: 'Surplus' };
}

/** The unaccounted balance: "Unaccounted for" while money is missing, "Surplus" once more turned up than went missing. */
export function readUnaccounted(balance: number): GapReading {
  const r = readGap(balance);
  return { ...r, label: r.kind === 'surplus' ? 'Surplus' : r.kind === 'missing' ? 'Unaccounted for' : 'Nothing unaccounted for' };
}

/** "12,000 missing", "5,000 surplus", "nothing". */
export function gapPhrase(gap: number, format: (n: number) => string): string {
  const r = readGap(gap);
  return r.kind === 'none' ? 'nothing' : `${format(r.amount)} ${r.kind}`;
}
