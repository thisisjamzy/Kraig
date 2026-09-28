// The Google Calendar bridge client — one POST per call to the Apps Script
// web app (NEXT_PUBLIC_CALENDAR_BRIDGE_URL). Knows nothing about Firestore,
// so it's tested with a mocked fetch (test/calendarBridge.test.ts).
//
// The request shape is dictated by Apps Script, and every rule below is a
// workaround, not a style choice:
//   - Content-Type text/plain and NO other header: Apps Script can't answer
//     a CORS preflight, and any other header (Authorization,
//     application/json) triggers one;
//   - the Firebase ID token rides in the JSON body as idToken — never a
//     header, never the URL, never logged;
//   - redirect 'follow' (the /exec URL answers with a 302 to
//     script.googleusercontent.com), and never mode 'no-cors' (the response
//     would be unreadable);
//   - the HTTP status is always 200: success or failure is the body's `ok`.
//
// Timeouts: 60 seconds, or 5.5 minutes for a call that pushes blocks
// (PUSH_TIMEOUT_MS below).
//
// Retries live here so every caller gets them: an expired token is
// refreshed once, BUSY (another device or tab syncing) waits 3s then 6s,
// INTERNAL / network / timeout / a non-JSON body wait 2s then 5s. Anything
// else is thrown straight away as a BridgeError.

import { env } from '../config/env';
import type {
  BridgeAction,
  BridgeBlock,
  BridgeEnvelope,
  BridgeErrorCode,
  BridgeWindow,
  FreeBusyResult,
  PingResult,
  PullResult,
  SyncResult,
} from './types';

export const BRIDGE_TIMEOUT_MS = 60_000;
// A call that pushes blocks can legitimately run much longer: the bridge
// waits up to 25s for its lock, then writes for up to ~4.5 minutes before
// stopping with truncated: true (CALENDAR-BRIDGE.md section 3.11). Timing
// out sooner would abort a push still running on Google's side, and the
// retry would only hit BUSY. 5.5 minutes covers both, under Apps Script's
// 6-minute cap.
export const PUSH_TIMEOUT_MS = 330_000;
export const MAX_WINDOW_DAYS = 180;
export const MAX_BLOCKS = 300;
const BUSY_DELAYS_MS = [3000, 6000];
const TRANSIENT_DELAYS_MS = [2000, 5000];
const TRANSIENT: BridgeErrorCode[] = ['INTERNAL', 'NETWORK', 'TIMEOUT', 'BAD_RESPONSE'];

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly details: unknown;
  constructor(code: BridgeErrorCode, message?: string, details?: unknown) {
    super(message || code);
    this.name = 'BridgeError';
    this.code = code;
    this.details = details;
  }
}

export interface BridgeOptions {
  /** Defaults to env.calendarBridgeUrl. */
  url?: string;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Defaults to the signed-in Firebase user's getIdToken(forceRefresh). */
  getIdToken?: (forceRefresh: boolean) => Promise<string | null>;
  /** Defaults to a real timer — tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/** Is there a usable bridge URL? Missing or a leftover placeholder = sync off. */
export function isBridgeConfigured(url: string = env.calendarBridgeUrl): boolean {
  return /^https:\/\/\S+\/exec$/.test(url) && !url.includes('YOUR_DEPLOYMENT_ID');
}

async function defaultGetIdToken(forceRefresh: boolean): Promise<string | null> {
  const { getFirebaseAuth } = await import('../config/firebaseClient');
  const user = getFirebaseAuth().currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function checkWindow(params: Record<string, unknown>) {
  const min = Date.parse(String(params.timeMin));
  const max = Date.parse(String(params.timeMax));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new BridgeError('BAD_REQUEST', 'timeMin and timeMax must be ISO strings, timeMin first');
  }
  if (max - min > MAX_WINDOW_DAYS * 86_400_000) {
    throw new BridgeError('BAD_REQUEST', `The sync window can't be longer than ${MAX_WINDOW_DAYS} days`);
  }
}

async function callOnce<T>(
  url: string,
  doFetch: typeof fetch,
  timeoutMs: number,
  body: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text: string;
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new BridgeError('TIMEOUT', 'The calendar bridge took too long to answer');
    throw new BridgeError('NETWORK', error instanceof Error ? error.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
  let envelope: BridgeEnvelope<T>;
  try {
    envelope = JSON.parse(text) as BridgeEnvelope<T>;
  } catch {
    throw new BridgeError('BAD_RESPONSE', 'The calendar bridge sent something that is not JSON');
  }
  if (!envelope || typeof envelope !== 'object' || typeof envelope.ok !== 'boolean') {
    throw new BridgeError('BAD_RESPONSE', 'The calendar bridge sent an unexpected response');
  }
  if (envelope.ok) return envelope.data;
  const code = (envelope.error?.code || 'INTERNAL') as BridgeErrorCode;
  throw new BridgeError(code, envelope.error?.message, envelope.error?.details);
}

/** One bridge call, with the retry rules in this file's header. */
export async function bridgeCall<T>(
  action: BridgeAction,
  params: Record<string, unknown>,
  options: BridgeOptions = {}
): Promise<T> {
  const url = options.url ?? env.calendarBridgeUrl;
  if (!isBridgeConfigured(url)) throw new BridgeError('NOT_CONFIGURED', 'Google Calendar sync is not configured');
  checkWindow(params);
  const doFetch = options.fetch ?? fetch;
  const getIdToken = options.getIdToken ?? defaultGetIdToken;
  const sleep = options.sleep ?? realSleep;
  const timeoutMs = options.timeoutMs ?? BRIDGE_TIMEOUT_MS;

  let refresh = false;
  let refreshed = false;
  let busyTries = 0;
  let transientTries = 0;
  for (;;) {
    const idToken = await getIdToken(refresh);
    refresh = false;
    if (!idToken) throw new BridgeError('NO_USER', 'Nobody is signed in');
    try {
      return await callOnce<T>(url, doFetch, timeoutMs, JSON.stringify({ ...params, action, idToken }));
    } catch (error) {
      const err = error instanceof BridgeError ? error : new BridgeError('INTERNAL', String(error));
      if ((err.code === 'UNAUTHENTICATED' || err.code === 'TOKEN_EXPIRED') && !refreshed) {
        refresh = true;
        refreshed = true;
        continue;
      }
      if (err.code === 'BUSY' && busyTries < BUSY_DELAYS_MS.length) {
        await sleep(BUSY_DELAYS_MS[busyTries++]);
        continue;
      }
      if (TRANSIENT.includes(err.code) && transientTries < TRANSIENT_DELAYS_MS.length) {
        await sleep(TRANSIENT_DELAYS_MS[transientTries++]);
        continue;
      }
      throw err;
    }
  }
}

// ---- Actions ----

/** The calendar's id, name and time zone — "Test connection". */
export function ping(window: BridgeWindow, options?: BridgeOptions): Promise<PingResult> {
  return bridgeCall<PingResult>('ping', { ...window }, options);
}

/** Every live Google event in the window (never the app's own blocks). */
export function pull(window: BridgeWindow, options?: BridgeOptions): Promise<PullResult> {
  return bridgeCall<PullResult>('pull', { ...window, includeDredaBlocks: false }, options);
}

/** The COMPLETE list of the app's blocks in the window. With deleteMissing,
 * blocks the app no longer has are deleted from Google; an empty list then
 * needs allowEmpty. */
export function push(
  window: BridgeWindow,
  blocks: BridgeBlock[],
  { deleteMissing = true }: { deleteMissing?: boolean } = {},
  options?: BridgeOptions
): Promise<unknown> {
  return bridgeCall<unknown>(
    'push',
    { ...window, blocks, deleteMissing, ...(blocks.length === 0 ? { allowEmpty: true } : {}) },
    { timeoutMs: PUSH_TIMEOUT_MS, ...options }
  );
}

/** Push then pull in one call. Leave blocks out (undefined) to only pull. */
export function sync(window: BridgeWindow, blocks: BridgeBlock[] | undefined, options?: BridgeOptions): Promise<SyncResult> {
  const pushPart = blocks
    ? { blocks, deleteMissing: true, ...(blocks.length === 0 ? { allowEmpty: true } : {}) }
    : {};
  // Pull only (no blocks) keeps the normal 60s timeout.
  return bridgeCall<SyncResult>(
    'sync',
    { ...window, includeDredaBlocks: false, ...pushPart },
    blocks ? { timeoutMs: PUSH_TIMEOUT_MS, ...options } : options
  );
}

/** Busy ranges in the window — for a later "find a free slot" screen. */
export function freeBusy(window: BridgeWindow, options?: BridgeOptions): Promise<FreeBusyResult> {
  return bridgeCall<FreeBusyResult>('freebusy', { ...window }, options);
}
