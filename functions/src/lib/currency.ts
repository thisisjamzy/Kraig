// Same principle as sheets/Code.gs's buildCurrencyContext_/convert_/toDisplay_,
// narrowed to what the stats triggers need: every stats document is stored
// in `defaultCurrency` (PRD-FIREBASE.md section 8), converted from whatever
// currency the account involved actually holds.
//
// Every function takes `uid` explicitly — settings/exchangeRates/accounts
// all live under users/{uid}/... now (see PRD-FIREBASE.md's "per-account
// data, never shared" note and firestore.rules' header), not as top-level
// collections.

import { db } from './firestore';

export type RateMap = Record<string, number>;

export async function getDefaultCurrency(uid: string): Promise<string> {
  const snap = await db.collection('users').doc(uid).collection('settings').doc('app').get();
  return (snap.data()?.defaultCurrency as string | undefined) || 'XAF';
}

export async function getExchangeRates(uid: string): Promise<RateMap> {
  const snap = await db.collection('users').doc(uid).collection('exchangeRates').get();
  const rates: RateMap = {};
  snap.forEach((doc) => {
    const rate = doc.data().rateToBase;
    if (typeof rate === 'number') rates[doc.id] = rate;
  });
  return rates;
}

/** amount in `from` currency -> amount in `to` currency, via the
 * base-anchored rate table. Fails open (1:1) rather than throwing — this
 * runs inside a Firestore trigger, where a thrown error causes retries; a
 * missing exchange rate should degrade the number shown, not wedge the
 * account balance update that has to happen regardless. */
export function convert(amount: number, from: string, to: string, rates: RateMap): number {
  if (!from || !to || from === to) return amount;
  const rFrom = rates[from];
  const rTo = rates[to];
  if (rFrom == null || rTo == null) {
    console.warn(`[currency] missing exchange rate for ${from} or ${to}, treating as 1:1`);
    return amount;
  }
  return (amount * rFrom) / rTo;
}

// Keyed by `${uid}:${accountId}` — a function instance can be reused (warm)
// across invocations for DIFFERENT users, so the cache key has to include
// uid even though a real accountId collision across two users' subtrees is
// astronomically unlikely (both are random UUIDs).
const accountCurrencyCache = new Map<string, string>();

/** An account's own recorded currency — a transaction/transfer's currency
 * is always its account's currency, same convention as the old Sheet. */
export async function currencyOfAccount(uid: string, accountId: string | undefined, fallback: string): Promise<string> {
  if (!accountId) return fallback;
  const cacheKey = `${uid}:${accountId}`;
  const cached = accountCurrencyCache.get(cacheKey);
  if (cached) return cached;
  const snap = await db.collection('users').doc(uid).collection('accounts').doc(accountId).get();
  const currency = (snap.data()?.currency as string | undefined) || fallback;
  accountCurrencyCache.set(cacheKey, currency);
  return currency;
}
