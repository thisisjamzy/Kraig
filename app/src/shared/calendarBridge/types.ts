// The Google Calendar bridge's wire types — the Apps Script web app that
// reads and writes one Google Calendar on the household's behalf. The bridge
// is deployed and owned outside this repo; these types follow its contract
// (PRD Files/CALENDAR-BRIDGE.md section 2), nothing here changes it.

export type BridgeAction = 'ping' | 'sync' | 'pull' | 'push' | 'freebusy';

export type BridgeErrorCode =
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'MISCONFIGURED'
  | 'BAD_REQUEST'
  | 'UNKNOWN_ACTION'
  | 'EMPTY_PUSH_REFUSED'
  | 'TOO_MANY_BLOCKS'
  | 'BUSY'
  | 'INTERNAL'
  // Client-side failures, never sent by the bridge itself.
  | 'NETWORK'
  | 'TIMEOUT'
  | 'BAD_RESPONSE'
  | 'NOT_CONFIGURED'
  | 'NO_USER';

/** Every call is bounded to a window, at most 180 days long. */
export interface BridgeWindow {
  timeMin: string; // ISO
  timeMax: string; // ISO
}

/** A Google event time: timed (dateTime with offset) or all-day (date,
 * and an all-day end date is exclusive). */
export interface GoogleEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleAttendee {
  email: string | null;
  name: string | null;
  responseStatus: string | null; // accepted | declined | tentative | needsAction
  optional: boolean;
}

export interface GoogleOrganizer {
  email: string | null;
  name: string | null;
  self: boolean;
}

/** One live Google event, as pull returns it. Recurring series arrive as
 * separate instances; declined, cancelled and working-location events are
 * never returned. */
export interface GoogleEvent {
  googleEventId: string;
  recurringEventId: string | null;
  iCalUID?: string | null;
  // dreda-block: one of the app's own blocks mirrored by the bridge — only
  // returned with includeDredaBlocks true, which the app never sends.
  kind: 'meeting' | 'event' | 'dreda-block';
  source: 'google' | 'booking' | 'dreda';
  dredaId?: string | null;
  eventType?: string; // 'default', 'focusTime', 'outOfOffice', ...
  status?: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  start: GoogleEventTime;
  end: GoogleEventTime;
  /** false when the event is marked Free in Google. */
  blocksTime: boolean;
  selfResponse: string | null;
  organizer: GoogleOrganizer | null;
  attendees: GoogleAttendee[];
  meetingLink: string | null;
  htmlLink: string | null;
  updated: string | null;
}

/** One app block sent to Google (a task, or one date of a recurring task). */
export interface BridgeBlock {
  /** Unique per occurrence, max 200 chars: taskId, or taskId__yyyyMMdd. */
  id: string;
  title: string;
  description?: string;
  /** Timed: ISO with an offset. All-day: "YYYY-MM-DD". */
  start: string;
  /** Timed: ISO with an offset. All-day: "YYYY-MM-DD", exclusive. */
  end: string;
  allDay: boolean;
  timeZone: string;
  colorId?: string;
}

export interface PingResult {
  uid?: string;
  calendarId: string;
  calendarName: string;
  timeZone: string;
  blockTitleMode?: 'title' | 'busy';
}

export interface PullResult {
  calendarId?: string;
  timeZone?: string;
  window?: BridgeWindow;
  complete: boolean;
  counts?: Record<string, number>;
  events: GoogleEvent[];
}

/** push's result as the bridge sends it (normalized by
 * normalizePushResult, src/shared/calendarSync/results.ts). */
export interface RawPushResult {
  calendarId: string;
  window: BridgeWindow;
  results: { dredaId: string; googleEventId: string; status: BlockOutcome }[];
  deleted: { dredaId: string | null; googleEventId: string }[];
  // dredaId is null for a block that failed validation before its id was
  // read — then `index` is its position in the blocks sent.
  failed: { dredaId: string | null; index?: number; code: string; message: string }[];
  conflicts: { dredaId: string; googleEventId: string; kind: string; title: string; start: GoogleEventTime; end: GoogleEventTime }[];
  truncated: boolean;
  skipped: string[];
}

/** What happened to one pushed block. restored = the user deleted or
 * changed it in Google and the bridge put it back (the app owns blocks). */
export type BlockOutcome = 'created' | 'updated' | 'unchanged' | 'restored';

export interface ConflictingEvent {
  googleEventId: string;
  title: string;
  start: string;
  end: string;
}

/** The push result, normalized (see normalizePushResult in
 * src/shared/calendarSync/results.ts for the raw shapes accepted). */
export interface PushResult {
  blocks: { id: string; outcome: BlockOutcome; googleEventId: string | null }[];
  failed: { id: string; message: string }[];
  conflicts: { id: string; events: ConflictingEvent[] }[];
  deleted: number;
  truncated: boolean;
  skipped: string[];
}

export interface SyncResult {
  /** null when no blocks were sent (pull only). */
  push: RawPushResult | null;
  pull: PullResult;
}

export interface BusyRange {
  start: string;
  end: string;
}

export interface FreeBusyResult {
  window: BridgeWindow;
  busy: BusyRange[];
  errors: unknown;
  // Mirrored Dreda blocks are Busy events in Google, so they're in `busy`.
  includesDredaBlocks: boolean;
}

/** The body every response has, whatever the HTTP status (always 200). */
export type BridgeEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message?: string; details?: unknown } };
