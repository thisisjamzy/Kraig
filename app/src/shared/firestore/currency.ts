// Client-side display-currency conversion (PRD-FIREBASE.md section 8) — the
// same principle sheets/Code.gs's buildCurrencyContext_/convert_/toDisplay_
// used server-side, now run entirely in the browser since the client reads
// exchangeRates live. Every account/transaction/transfer amount stays
// stored in its own native currency forever; this only ever affects what's
// rendered.

import type { FirestoreExchangeRate } from './types';

export interface CurrencyContext {
  base: string;
  display: string;
  rates: Record<string, number>;
}

export function buildCurrencyContext(
  exchangeRates: FirestoreExchangeRate[],
  defaultCurrency: string,
  displayCurrency: string
): CurrencyContext {
  const rates: Record<string, number> = {};
  exchangeRates.forEach((rate) => {
    rates[rate.id] = rate.rateToBase;
  });
  return { base: defaultCurrency, display: displayCurrency || defaultCurrency, rates };
}

export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (!from || !to || from === to) return amount;
  const rFrom = rates[from];
  const rTo = rates[to];
  if (rFrom == null || rTo == null) return amount; // no configured rate — show native rather than throw
  return (amount * rFrom) / rTo;
}

export function toDisplay(ctx: CurrencyContext, amount: number, nativeCurrency: string): number {
  return round2(convert(amount, nativeCurrency, ctx.display, ctx.rates));
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
