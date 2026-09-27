// When a transaction or transfer happened, to the minute where we can tell.
// Most records store a date only (midnight). Their document ids are random
// UUIDs (or Notion page ids for migrated ones), so the id carries no time,
// but createdAt does: the moment it was recorded (for migrated records,
// Notion's own created time). When it was recorded on the same day as its
// date, that is the best time we have; when it was entered on a later day
// (back-dated), the time of day isn't known, so none is shown rather than
// a made-up midnight.

type Stamp = { toDate: () => Date } | null | undefined;

export interface RecordedAt {
  /** The date, with the best-known time of day. */
  date: Date;
  /** False when only the day is known. */
  timeKnown: boolean;
}

export function recordedAt(date: Stamp, createdAt: Stamp): RecordedAt {
  const d = date?.toDate() ?? createdAt?.toDate() ?? new Date(0);
  const atMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  if (!atMidnight) return { date: d, timeKnown: true };
  const created = createdAt?.toDate();
  if (created && created.toDateString() === d.toDateString()) return { date: created, timeKnown: true };
  return { date: d, timeKnown: false };
}
