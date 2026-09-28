// The Google Calendar bridge client (app/src/shared/calendarBridge) against
// a mocked fetch: the request shape Apps Script needs, envelope unwrapping,
// typed errors, and the retry rules.
// Run: npx tsx --test test/calendarBridge.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeError, PUSH_TIMEOUT_MS, bridgeCall, isBridgeConfigured, sync, type BridgeOptions } from '../app/src/shared/calendarBridge/client';

const URL = 'https://script.google.com/macros/s/abc123/exec';
const WINDOW = { timeMin: '2026-09-21T00:00:00.000Z', timeMax: '2026-11-27T00:00:00.000Z' };

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/** A fetch that answers each call with the next queued body (or throws). */
function mockFetch(responses: (unknown | Error | 'hang' | string)[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (next === 'hang') {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    const text = typeof next === 'string' ? next : JSON.stringify(next);
    return { status: 200, text: async () => text } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function options(fetchImpl: typeof fetch, extra: Partial<BridgeOptions> = {}) {
  const tokenCalls: boolean[] = [];
  const sleeps: number[] = [];
  const opts: BridgeOptions = {
    url: URL,
    fetch: fetchImpl,
    getIdToken: async (force) => {
      tokenCalls.push(force);
      return force ? 'fresh-token' : 'cached-token';
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...extra,
  };
  return { opts, tokenCalls, sleeps };
}

test('sends text/plain and no other header, token in the body, follows redirects', async () => {
  const { fetchImpl, calls } = mockFetch([{ ok: true, data: { calendarName: 'Home' } }]);
  const { opts } = options(fetchImpl);
  const data = await bridgeCall<{ calendarName: string }>('ping', { ...WINDOW }, opts);
  assert.equal(data.calendarName, 'Home');
  const { init, body, url } = calls[0];
  assert.equal(url, URL);
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'text/plain;charset=utf-8' });
  assert.equal(init.redirect, 'follow');
  assert.notEqual(init.mode, 'no-cors');
  assert.equal(body.action, 'ping');
  assert.equal(body.idToken, 'cached-token');
  assert.equal(body.timeMin, WINDOW.timeMin);
  assert.ok(!url.includes('token'));
});

test('unwraps ok responses and throws typed errors from the body', async () => {
  const { fetchImpl } = mockFetch([{ ok: false, error: { code: 'FORBIDDEN', message: 'not on the list' } }]);
  const { opts } = options(fetchImpl);
  await assert.rejects(bridgeCall('ping', { ...WINDOW }, opts), (e: unknown) => {
    assert.ok(e instanceof BridgeError);
    assert.equal(e.code, 'FORBIDDEN');
    return true;
  });
});

test('refreshes the token once on UNAUTHENTICATED, then gives up', async () => {
  const { fetchImpl, calls } = mockFetch([
    { ok: false, error: { code: 'UNAUTHENTICATED' } },
    { ok: true, data: { fine: true } },
  ]);
  const { opts, tokenCalls } = options(fetchImpl);
  await bridgeCall('ping', { ...WINDOW }, opts);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.equal(calls[1].body.idToken, 'fresh-token');

  const second = mockFetch([
    { ok: false, error: { code: 'TOKEN_EXPIRED' } },
    { ok: false, error: { code: 'TOKEN_EXPIRED' } },
  ]);
  const { opts: opts2 } = options(second.fetchImpl);
  await assert.rejects(bridgeCall('ping', { ...WINDOW }, opts2), (e: unknown) => (e as BridgeError).code === 'TOKEN_EXPIRED');
  assert.equal(second.calls.length, 2);
});

test('retries BUSY after 3s and 6s, three tries at most', async () => {
  const busy = { ok: false, error: { code: 'BUSY' } };
  const { fetchImpl, calls } = mockFetch([busy, busy, busy, busy]);
  const { opts, sleeps } = options(fetchImpl);
  await assert.rejects(bridgeCall('sync', { ...WINDOW }, opts), (e: unknown) => (e as BridgeError).code === 'BUSY');
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [3000, 6000]);
});

test('retries INTERNAL, network errors and non-JSON after 2s and 5s', async () => {
  const { fetchImpl, calls } = mockFetch([
    { ok: false, error: { code: 'INTERNAL' } },
    new TypeError('Failed to fetch'),
    { ok: true, data: 1 },
  ]);
  const { opts, sleeps } = options(fetchImpl);
  assert.equal(await bridgeCall('ping', { ...WINDOW }, opts), 1);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [2000, 5000]);

  const html = mockFetch(['<html>Sign in</html>', '<html>', '<html>']);
  const { opts: opts2 } = options(html.fetchImpl);
  await assert.rejects(bridgeCall('ping', { ...WINDOW }, opts2), (e: unknown) => (e as BridgeError).code === 'BAD_RESPONSE');
  assert.equal(html.calls.length, 3);
});

test('does not retry app bugs', async () => {
  const { fetchImpl, calls } = mockFetch([{ ok: false, error: { code: 'BAD_REQUEST' } }]);
  const { opts } = options(fetchImpl);
  await assert.rejects(bridgeCall('ping', { ...WINDOW }, opts), (e: unknown) => (e as BridgeError).code === 'BAD_REQUEST');
  assert.equal(calls.length, 1);
});

test('times out at 60 seconds by default', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  // Fire the timeout straight away, but record what it was set to.
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return realSetTimeout(fn, 0);
  }) as typeof setTimeout;
  try {
    const { fetchImpl } = mockFetch(['hang', 'hang', 'hang']);
    const { opts } = options(fetchImpl);
    await assert.rejects(bridgeCall('ping', { ...WINDOW }, opts), (e: unknown) => (e as BridgeError).code === 'TIMEOUT');
    assert.ok(delays.includes(60_000));
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test('a call that pushes blocks gets the longer push timeout; pull-only keeps 60s', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return realSetTimeout(fn, 0);
  }) as typeof setTimeout;
  try {
    const ok = { ok: true, data: { push: null, pull: { events: [], complete: true } } };
    const { fetchImpl } = mockFetch([ok, ok]);
    const { opts } = options(fetchImpl);
    await sync(WINDOW, [], opts);
    await sync(WINDOW, undefined, opts);
    assert.deepEqual(delays, [PUSH_TIMEOUT_MS, 60_000]);
    assert.equal(PUSH_TIMEOUT_MS, 330_000);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test('sync sends includeDredaBlocks false, and an empty push needs allowEmpty', async () => {
  const { fetchImpl, calls } = mockFetch([
    { ok: true, data: { push: {}, pull: { events: [], complete: true } } },
    { ok: true, data: { pull: { events: [], complete: true } } },
  ]);
  const { opts } = options(fetchImpl);
  await sync(WINDOW, [], opts);
  assert.equal(calls[0].body.includeDredaBlocks, false);
  assert.deepEqual(calls[0].body.blocks, []);
  assert.equal(calls[0].body.allowEmpty, true);
  assert.equal(calls[0].body.deleteMissing, true);
  await sync(WINDOW, undefined, opts);
  assert.equal('blocks' in calls[1].body, false);
});

test('refuses a window over 180 days, and is off without a URL', async () => {
  const { fetchImpl, calls } = mockFetch([]);
  const { opts } = options(fetchImpl);
  await assert.rejects(
    bridgeCall('ping', { timeMin: '2026-01-01T00:00:00Z', timeMax: '2026-12-31T00:00:00Z' }, opts),
    (e: unknown) => (e as BridgeError).code === 'BAD_REQUEST'
  );
  assert.equal(calls.length, 0);
  assert.equal(isBridgeConfigured(''), false);
  assert.equal(isBridgeConfigured('https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'), false);
  assert.equal(isBridgeConfigured(URL), true);
  await assert.rejects(bridgeCall('ping', { ...WINDOW }, { ...opts, url: '' }), (e: unknown) => (e as BridgeError).code === 'NOT_CONFIGURED');
});
