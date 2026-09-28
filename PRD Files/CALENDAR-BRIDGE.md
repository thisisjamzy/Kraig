# Dreda Calendar Bridge

A Google Apps Script web app that syncs Dreda's calendar with one Google Calendar.

- **Pull**: Google events (including meetings booked through scheduling links) come into the app.
- **Push**: time the app has blocked goes onto Google Calendar as Busy events, so scheduling links stop offering those slots.
- **Sync**: push then pull in one call. The app calls this right after login.

The script never touches Firestore. The app sends its blocks, gets Google's events back, and writes to Firestore itself with its own signed-in session, the same client-side pattern `aggregation.ts` uses on the Spark plan.

---

## 1. Deploy

1. Go to [script.google.com](https://script.google.com) while signed in to the Google account whose calendar should be synced. Create a new project named "Dreda Calendar Bridge".
2. Project Settings: tick **Show "appsscript.json" manifest file in editor**.
3. Paste `Code.gs` over the default `Code.gs`, and `appsscript.json` over the manifest. Save.
4. Services (left sidebar, `+`): confirm **Google Calendar API** is listed as `Calendar`, v3. The manifest adds it; this just checks it took.
5. Give the script its settings. These are stored as **Script Properties**: name/value pairs kept in the project's settings instead of in the code, so the API key never sits in `Code.gs`.

   **5a. Find the two required values first.**

   - **Firebase Web API key.** Open [console.firebase.google.com](https://console.firebase.google.com), pick the Dreda project, click the gear icon next to "Project Overview", then **Project settings**. On the **General** tab, scroll to **Your apps**, select the web app, and copy the `apiKey` value from the config snippet (it starts with `AIza`). It is the same value as `apiKey` in the app's own Firebase config, so you can also copy it from there.
   - **Your Firebase uid.** In the same console, open **Build, Authentication**, then the **Users** tab. Find your sign-in email and copy the **User UID** column (a string like `kX9aB3...`). Hover the row and use the copy icon so nothing gets cut off.

   **5b. Add them to the script.**

   1. In the Apps Script editor, click the gear icon (**Project Settings**) in the left sidebar.
   2. Scroll to the bottom, to the **Script Properties** section, and click **Add script property**.
   3. In **Property**, type `FIREBASE_API_KEY`. In **Value**, paste the API key.
   4. Click **Add script property** again. Property `ALLOWED_UIDS`, value your uid. To allow more than one Dreda account, separate the uids with commas: `uidOne,uidTwo`.
   5. Click **Save script properties**.

   That is enough to get it working. Property names are case-sensitive and must match exactly.

   **5c. Only if needed.** Add any of these the same way. Leave them out to keep the default.

| Property | When to add it | Value |
|---|---|---|
| `APP_ORIGIN` | Only if `authorizeOnce` or a real call later reports `MISCONFIGURED` mentioning a referrer. That happens when the API key is restricted to certain websites in Google Cloud console | The address the app is served from, no trailing path, e.g. `https://dreda.web.app` |
| `CALENDAR_ID` | To sync a calendar other than your main one. Find the id in Google Calendar, the calendar's **Settings and sharing**, **Integrate calendar**, **Calendar ID** | Defaults to `primary` (your main calendar) |
| `BLOCK_TITLE_MODE` | For privacy: if people who can see your Google Calendar should not see what each block is | `title` (default) shows the block's title in Google; `busy` shows only `BUSY_TITLE` and makes the event private |
| `BUSY_TITLE` | To change the word shown on private blocks | Defaults to `Busy` |
| `BLOCK_COLOR_ID` | To colour mirrored blocks differently from your own events | Google Calendar colorId `1` to `11` for mirrored blocks |
| `PULL_DAYS_BACK` / `PULL_DAYS_FORWARD` | Rarely; the app normally sends its own window | Default window when a request sends none: 7 back, 60 forward |
| `MAX_WINDOW_DAYS` | Rarely | Largest window a request may ask for. Default 180 |
| `MAX_BLOCKS_PER_PUSH` | Rarely | Default 300 |
| `AUTH_CACHE_SECONDS` | Rarely | How long a verified token is cached. Default 300 |

6. In the editor, select `authorizeOnce` and Run. Approve the Calendar and external-request permissions. The log confirms the calendar and lists any missing properties.
7. Optional: run `devSmokeTest`. It creates, re-pushes, pulls, and deletes one test block about 400 days out, with a narrow window so no real block can be touched. Expected log: created, unchanged, 1 dreda-block, 1 deleted.
8. **Deploy, New deployment**, type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
9. Copy the web app URL (ends in `/exec`). The app will use it as `VITE_CALENDAR_BRIDGE_URL` (or whatever env name the app uses).

**Updating later:** Deploy, **Manage deployments**, edit the existing deployment, Version: **New version**. This keeps the same URL. Creating a *new* deployment gives a new URL and the app would need its env var changed.

---

## 2. API contract

One URL. Every real call is a `POST` whose JSON body carries an `action` and the user's Firebase ID token. `GET` is a health check only.

### Calling it from the browser

```ts
const res = await fetch(BRIDGE_URL, {
  method: 'POST',
  // text/plain on purpose: it keeps this a "simple" request with no CORS preflight,
  // which Apps Script cannot answer. The body is still JSON.
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'sync', idToken: await user.getIdToken(), ...params }),
  redirect: 'follow',
});
const json = await res.json();
if (!json.ok) throw json.error; // { code, message, details }
```

Every response is HTTP 200. Success or failure is in the body:

```json
{ "ok": true,  "data": { ... },                               "apiVersion": "1.0.0", "serverTime": "..." }
{ "ok": false, "error": { "code": "...", "message": "...", "details": null }, "apiVersion": "1.0.0", "serverTime": "..." }
```

### Common fields

| Field | Type | Notes |
|---|---|---|
| `action` | string | `ping`, `pull`, `push`, `sync`, `freebusy` |
| `idToken` | string | `await auth.currentUser.getIdToken()` |
| `timeMin`, `timeMax` | ISO 8601 string | Optional. Window to act on. Defaults to 7 days back, 60 days forward. At most 180 days |

### `ping`

Checks auth and config. Returns `{ uid, calendarId, calendarName, timeZone, blockTitleMode }`.

### `pull`

Extra field: `includeDredaBlocks` (default `true`). Set `false` to leave out events this bridge created from Dreda blocks.

Returns:

```json
{
  "calendarId": "primary",
  "timeZone": "Africa/Douala",
  "window": { "timeMin": "...", "timeMax": "..." },
  "complete": true,
  "counts": { "meeting": 3, "event": 5, "dreda-block": 12 },
  "events": [ Event, ... ]
}
```

`complete: true` means this is every live event in the window. **Any Google-sourced event the app has stored in that window that is not in this list was deleted, cancelled, or declined in Google** and should be removed from Firestore.

**Event shape**

```ts
{
  googleEventId: string;          // stable key for upserting into Firestore
  recurringEventId: string | null; // set on each instance of a recurring series
  iCalUID: string | null;
  kind: 'meeting' | 'event' | 'dreda-block';
  source: 'google' | 'booking' | 'dreda';
  dredaId: string | null;         // set when kind is 'dreda-block'
  eventType: string;              // 'default', 'focusTime', 'outOfOffice', ...
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: { dateTime: string | null; date: string | null; timeZone: string | null };
  end:   { dateTime: string | null; date: string | null; timeZone: string | null };
  blocksTime: boolean;            // false when the event is marked "Free" in Google
  status: string;
  selfResponse: string | null;    // 'accepted' | 'tentative' | 'needsAction' | null
  organizer: { email: string | null; name: string | null; self: boolean } | null;
  attendees: { email: string | null; name: string | null; responseStatus: string | null; optional: boolean }[];
  meetingLink: string | null;     // Meet or other conference link
  htmlLink: string | null;        // opens the event in Google Calendar
  updated: string | null;
}
```

How `kind` is decided:

- `dreda-block`: created by this bridge from a Dreda block. The app already has it; do not import it as a meeting.
- `meeting`: has at least one other guest. This is what a scheduling-link booking looks like (Google appointment schedules, Calendly, etc. all add the booker as a guest). Also any event tagged as a Dreda booking.
- `event`: everything else (solo events, focus time, out of office).

Declined events, cancelled events, and working-location markers are never returned.

### `push`

Extra fields:

| Field | Type | Notes |
|---|---|---|
| `blocks` | Block[] | **The complete set of the user's blocks in the window**, not just changes |
| `deleteMissing` | boolean | Default `true`. Dreda blocks already in Google, starting in the window, but missing from `blocks` get deleted |
| `allowEmpty` | boolean | Required to send `blocks: []` when that would delete anything (guard against wiping the calendar by accident) |

**Block shape**

```ts
{
  id: string;          // the Firestore time-block document id, max 200 chars
  title?: string;
  description?: string;
  start: string;       // timed: ISO with offset, '2026-09-28T09:00:00+01:00'. all-day: '2026-09-28'
  end: string;         // all-day end is exclusive: a one-day block on the 28th ends '2026-09-29'
  allDay?: boolean;
  timeZone?: string;   // IANA, e.g. 'Africa/Douala'
  colorId?: string;    // '1' to '11'
}
```

Returns:

```ts
{
  calendarId: string;
  window: { timeMin: string; timeMax: string };
  results:   { dredaId: string; googleEventId: string; status: 'created' | 'updated' | 'unchanged' | 'restored' }[];
  deleted:   { dredaId: string | null; googleEventId: string }[];
  failed:    { dredaId: string | null; index?: number; code: string; message: string }[];
  conflicts: { dredaId: string; googleEventId: string; kind: string; title: string; start: object; end: object }[];
  truncated: boolean;  // true if it stopped early to stay inside Apps Script's time limit
  skipped:   string[]; // block ids not processed because of truncation; send them again
}
```

- Store `googleEventId` on each Firestore block for reference; the bridge does not need it back (it finds blocks by `dredaId`).
- `restored` means Google already had that id (for example the user deleted the event in Google). The bridge put it back, because the app is the source of truth for blocks.
- `conflicts` lists blocks that overlap a real Google event (a meeting booked before the block reached Google, say). Worth surfacing in the app.
- A block that fails validation is reported in `failed` and is **not** deleted from Google, so one bad field never wipes an existing block.

### `sync`

Same fields as `push` and `pull` together. Runs push, then pull, and returns `{ push, pull }`. If `blocks` is left out entirely, it only pulls and `push` is `null`.

This is the call to make after login.

### `freebusy`

Returns `{ window, busy: [{ start, end }], errors, includesDredaBlocks: true }`. For the "find a free slot" suggestion in `PRD-PROJECTS.md`. Includes mirrored Dreda blocks, since they are Busy events in Google.

### Error codes

| Code | Meaning | App should |
|---|---|---|
| `UNAUTHENTICATED` | Missing, malformed, or rejected token | Refresh token with `getIdToken(true)` and retry once |
| `TOKEN_EXPIRED` | Token past its `exp` | Same as above |
| `FORBIDDEN` | uid not in `ALLOWED_UIDS`, or account disabled | Show "calendar sync isn't set up for this account" |
| `MISCONFIGURED` | Script Properties missing or API key refused | Log it; this is a deploy problem, not a user one |
| `BAD_REQUEST` | Bad JSON, bad window, missing fields | Log it; this is an app bug |
| `TOO_MANY_BLOCKS` | Over `MAX_BLOCKS_PER_PUSH` | Narrow the window and push in pieces |
| `EMPTY_PUSH_REFUSED` | `blocks: []` would delete events | Resend with `allowEmpty: true` only if the user truly has no blocks |
| `BUSY` | Another sync holds the lock | Retry after 2 to 5 seconds |
| `UNKNOWN_ACTION` | Typo in `action` | App bug |
| `INTERNAL` | Unexpected error | Retry with backoff; check Executions log in Apps Script |

---

## 3. Workarounds and limitations

These are the places where Apps Script or Firebase's Spark plan forced a design choice. The app side needs to know about all of them.

### 3.1 CORS: send `Content-Type: text/plain`

Apps Script web apps cannot answer a CORS preflight (`OPTIONS`) request. A `fetch` with `Content-Type: application/json` or any custom header triggers a preflight, and the browser blocks it. Sending the JSON body as `text/plain` keeps it a "simple" request with no preflight. The script parses the body as JSON regardless.

Also do not add an `Authorization` header, for the same reason. That is why the token travels in the body.

### 3.2 The URL redirects

`/exec` answers with a 302 to `script.googleusercontent.com`, which serves the JSON with CORS allowed. `fetch` follows it automatically (`redirect: 'follow'` is the default). Do not use `redirect: 'manual'` or `mode: 'no-cors'`; the second makes the response unreadable.

### 3.3 No HTTP status codes

Apps Script always returns 200. Check `json.ok`, never `res.ok` alone.

### 3.4 Authentication without a server

Apps Script cannot verify a Firebase ID token's RS256 signature itself, and there are no Cloud Functions on Spark to do it. The script sends the token to Google's Identity Toolkit (`accounts:lookup`), which only returns a user for a genuine, unexpired token. A verified result is cached for 5 minutes so every call does not pay for a second round trip.

Two consequences:

- **API key referrer restrictions.** If the Firebase Web API key is restricted to HTTP referrers in Google Cloud console, Apps Script's server-side call has no referrer and gets refused. Setting `APP_ORIGIN` makes the script send that origin as the referrer. If the key is restricted by API instead, make sure Identity Toolkit API is on its allow list (it is by default for Firebase keys).
- **Single-owner calendar.** The web app runs as the Google account that deployed it, so it can only ever reach that one account's calendar. `ALLOWED_UIDS` is what stops any other Dreda account from reading or writing that calendar. Every Dreda account that should sync to a *different* Google Calendar needs its own copy of this script deployed from its own Google account, with its own URL. For one household calendar, one deployment is right.

### 3.5 "Anyone" access is deliberate

"Anyone with a Google account" would force a Google sign-in cookie on the request, which breaks `fetch` from the PWA. "Anyone" makes the URL publicly reachable, so the ID token check plus `ALLOWED_UIDS` is the whole security boundary. Treat the URL as semi-secret anyway (env var, not committed to a public repo).

### 3.6 Sync is not real time

There is no push notification from Google to the app. Google's watch channels need an HTTPS endpoint that accepts headers, which Apps Script cannot provide, and there is no server on Spark to receive them. So Google-side changes (a new booking) reach the app only when the app calls `sync` or `pull`: after login, when the Calendar screen opens, on a manual refresh, and optionally on a timer while the app is open and visible (every 5 to 10 minutes is plenty).

The other direction is covered: a block is pushed as soon as the app calls `push`, and once it is on Google Calendar, scheduling links treat that slot as busy right away.

### 3.7 Double-booking has a small race window

A scheduling link can book a slot in the seconds between the user creating a block in the app and the app pushing it. `push` reports this in `conflicts`. The app should push a block right after it is created or moved, not wait for the next login, and show conflicts to the user.

This also only protects booking tools that check this calendar's free/busy. Google Calendar appointment schedules do this automatically for the owner's primary calendar. For a secondary `CALENDAR_ID`, or tools like Calendly, the calendar has to be ticked as a "check for conflicts" calendar in that tool's settings.

### 3.8 Full-set push, not deltas

`push` expects **every** block in the window, and deletes Google copies of blocks that are missing. This is what lets deletions in the app reach Google without the app keeping a separate "deleted blocks" log. The trade-off: the app must never push a partial list (for example while Firestore is still loading) with `deleteMissing` on. The empty-list guard catches the worst case, not every case. If the app ever needs to push just one block, send `deleteMissing: false`.

### 3.9 Blocks edited in Google are overwritten

The app owns blocks. If someone moves or renames a mirrored block in Google Calendar, the next push puts it back, and a deleted one comes back as `restored`. Each mirrored block's description says so. If two-way editing of blocks is ever wanted, it needs a last-modified comparison that this version does not do.

### 3.10 Recurring events

`pull` expands recurring series into individual instances (`singleEvents`), so each one has its own `googleEventId`, and `recurringEventId` ties them together. Blocks are pushed as single events; a recurring block in the app should be sent as its individual occurrences inside the window.

### 3.11 Quotas and time limits

Apps Script runs are capped at 6 minutes, and Calendar has daily write quotas (a consumer account has far more than a household needs). The script retries rate-limit errors with backoff, skips writes for blocks that have not changed, and stops writing at about 4.5 minutes and reports `truncated: true` with the `skipped` ids. `LockService` makes overlapping syncs (two tabs, two devices) wait instead of racing; a caller that cannot get the lock in 25 seconds gets `BUSY`.

### 3.12 Time zones

Timed blocks must carry an explicit offset (`+01:00` or `Z`). A bare `2026-09-28T09:00:00` is rejected, because Apps Script would interpret it in the script's zone rather than the user's. All-day blocks use plain dates with an exclusive end.
