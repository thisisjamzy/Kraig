// Plain objects with Dates in, Firestore documents with Timestamps out, and
// back, all the way down. For modules that work in plain data (the debt
// wallet-effect runner, notifications) and store it.

import { Timestamp } from 'firebase/firestore';

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/** Dates to Timestamps; undefined fields dropped (Firestore refuses them). */
export function toStored(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(toStored);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toStored(v)]));
  return value;
}

/** Timestamps to Dates. */
export function fromStored(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromStored);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromStored(v)]));
  return value;
}
