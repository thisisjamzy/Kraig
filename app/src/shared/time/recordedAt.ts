// When a transaction or transfer happened, to the minute (owner, 23 Nov
// 2026): through viewmodels/transactionTime.ts's transactionInstant, so a
// picked time, a recorded one, and an older entry's logged time all read
// the same way. Every entry has a time now; `timeKnown` stays for callers
// that still ask, and is always true.

import { transactionInstant, type TimedLike } from '@/src/viewmodels/transactionTime';

export interface RecordedAt {
  /** The date, with its time of day. */
  date: Date;
  /** Always true: every entry has a time. */
  timeKnown: boolean;
}

/** In the device's time zone, which is how every screen formats dates. */
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function recordedAt(entry: TimedLike): RecordedAt {
  return { date: transactionInstant(entry, deviceZone()), timeKnown: true };
}
