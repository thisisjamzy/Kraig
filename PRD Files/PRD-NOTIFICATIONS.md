# Dreda: Push Notifications (Scheduling and Delivery)

**Status**: New feature specification. Nothing described here exists yet.
**Arch**: Departs from the established Dreda pattern in one real way, flagged up front in
Section 1 rather than buried: every other feature (`PRD-FIREBASE.md`, `PRD-GOALS-DEBT.md`,
`PRD-ANALYTICS.md`, `PRD-BUDGET-TRANSACTIONS.md`, `PRD-PROJECTS.md`) does its work either
client-side inside a `runTransaction()` at write time, or through Apps Script acting on behalf
of one already-signed-in user's own request. Scheduled push notifications need something to
fire while nobody has the app open at all, which is a genuinely different requirement, and this
PRD names the trade-off instead of quietly assuming it away. This version also specs full
create, read, update, and delete control over every reminder the household can see, not just
system-generated ones (Sections 8 and 9).

---

## 0. Why this PRD exists

Two earlier PRDs already deferred a version of this:

- `PRD-GOALS-DEBT.md`, Section 7: "SMS/push notifications for upcoming payments (deferred; can
  add later)."
- `PRD-ANALYTICS.md`, Section 6: "Push notifications driven by analytics thresholds (for example
  'you're 90% of budget'): a natural follow-on once the underlying numbers exist, but a separate
  feature with its own spec."

This is that spec. It builds one general-purpose scheduling and delivery system, not four
separate ad hoc reminder features, so that debt payment reminders, goal deadline warnings,
budget threshold alerts, and (once `PRD-PROJECTS.md`'s tasks exist) task due reminders all sit on
the same pipe, and so the household has one place to see, edit, and cancel every reminder Dreda
has scheduled on their behalf.

---

## 1. The actual problem, and the decision this PRD cannot make alone

### 1.1 Why this is harder than everything built so far

Every existing Dreda write happens because a signed-in person tapped something. `aggregation.ts`
updates `statsMonthly` inside the transaction that creates a transaction. The Calendar bridge
calls Apps Script directly from an already-authenticated browser session, at the moment the
person opens the Calendar screen. Nothing in the app today runs on a clock; everything runs on a
tap.

A scheduled notification is the opposite: "remind me 3 days before this debt payment is due"
has to fire on a specific future date whether or not the household ever opens the app that day.
On iOS in particular (the flagship platform per the architecture doc), a PWA does not get to run
any code once it is closed and not receiving an actual push message from Apple's push service.
A `setTimeout` in a tab that got closed three days ago does not exist anymore. There is no
client-side trick that closes this gap; something has to exist outside any person's browser,
wake up on a schedule, and initiate the send.

That "something" is, by definition, a server. Dreda has deliberately had none since the Spark
plan decision recorded in the architecture doc. This PRD has to either introduce one, or borrow
one, and it should be a household decision, not something buried in an implementation detail.

### 1.2 Three ways to close the gap

**Option A: Google Apps Script time-driven trigger, plus Firebase Cloud Messaging (recommended).**

Apps Script is already doing server-shaped work in this project (the Calendar bridge, the
Notion migration script), just always invoked by a live user session until now. Apps Script also
supports installable time-driven triggers (`ScriptApp.newTrigger(...).timeBased().everyMinutes
(15).create()`), which run on Google's own infrastructure on a schedule, independent of any
browser tab. Firebase Cloud Messaging (FCM) itself is free on the Spark plan; only Cloud
Functions requires Blaze, not FCM.

The trigger function, running every 15 minutes:

1. Queries Firestore's REST API for a collection-group query across every user's
   `scheduledNotifications` where `status == "pending"` and `scheduledFor <= now`.
2. For each due document, reads the target `devices` subcollection for that `uid`.
3. Builds an OAuth access token from a stored service account (Apps Script has no built-in JWT
   signer, but this is a well-documented recipe using `Utilities.computeRsaSha256Signature`
   against a service account key held in Script Properties).
4. Calls FCM's HTTP v1 send endpoint per device token.
5. Writes `status: "sent"` (or `"failed"` with the error) back onto the notification doc.

This keeps the whole system inside tools the household already operates and pays nothing for,
but it is real new code: a hand-rolled JWT/OAuth flow with no library to lean on, and a Firestore
REST client running outside anyone's Firebase Auth session.

**Option B: Upgrade to Firebase Blaze, use Cloud Functions and Cloud Scheduler.**

The textbook answer. Cloud Scheduler is a real cron; a Cloud Function calling the Firebase Admin
SDK sends an FCM message in a handful of lines, no hand-rolled JWT signing. This is the first
requirement in the whole app that a live user session cannot satisfy on its own, which is exactly
the kind of case the architecture doc says is "worth revisiting" for Blaze. The volume here (a
handful of scheduled sends for one household) would sit far inside Blaze's free tier, so the
practical cost is close to zero, but it is a plan change, and a deliberate philosophical shift
away from "no server," not just a config toggle.

**Option C: A third-party push service (OneSignal, Pusher Beams, or similar).**

Free tier for this volume, handles device tokens, scheduling, and delivery itself. Closer to buy
than build. The other external dependencies in this project (Notion, Google Calendar) are places
the household's own data already lived; a push vendor is new infrastructure with its own account
and SDK, a different kind of dependency than anything adopted so far.

### 1.3 What this PRD assumes going forward

Sections 2 through 10 are written against **Option A**, since it fits the project's existing
shape most closely, but the data model (Section 2) is intentionally the same regardless of which
option is chosen: a `scheduledNotifications` outbox that something reads and marks sent. Only
Section 5 (the sender) would change under Option B or C. Confirm the choice before implementation
starts; this is the single biggest open decision in this document, not a detail to settle mid-
build.

One more thing worth saying plainly: Option A is the first place in Dreda where a single leaked
credential (the Apps Script service account) can touch every household's data at once, rather
than being scoped to one signed-in person the way every other credential in this app is. That is
a real change to the app's blast radius, worth the household's eyes open, not just Claude's.

---

## 2. Data schema

### 2.1 `users/{uid}/devices/{deviceId}`

One document per browser/device that has granted notification permission.

```
{
  id: string
  token: string                 // FCM registration token for this device
  platform: "ios" | "android" | "desktop"
  userAgent: string              // for debugging and de-duplication
  createdAt: timestamp
  lastSeenAt: timestamp          // refreshed on each app open
  lastSendError: string | null   // set when FCM reports this token invalid
}
```

A household member with a phone and a laptop gets two documents. `lastSeenAt` lets a future
cleanup pass prune tokens nobody has used in months without guessing at expiry.

### 2.2 `users/{uid}/notificationSettings` (single document, not a collection)

```
{
  enabled: boolean                    // master switch
  timezone: string                    // IANA name, e.g. "Africa/Douala"
  quietHours: { start: string, end: string } | null   // "22:00" / "07:00", or null for none
  types: {
    debtPaymentDue: boolean
    goalDeadline: boolean
    budgetThreshold: boolean
    taskDue: boolean                  // relevant once PRD-PROJECTS.md tasks exist
  }
  updatedAt: timestamp
}
```

`timezone` matters because `scheduledFor` below is always stored as a UTC instant; converting
"3 days before the 15th" into an actual instant has to happen against a real timezone, not the
server's.

### 2.3 `users/{uid}/scheduledNotifications/{notificationId}`

The outbox. Every reminder, whether generated automatically or created directly by the person,
lives here from creation until it is sent, cancelled, or (for eligible types, see Section 9)
deleted outright.

```
{
  id: string
  uid: string
  type: "debt_payment_due" | "goal_deadline" | "budget_threshold" | "task_due" | "custom"
  title: string
  body: string
  scheduledFor: timestamp         // UTC instant to fire at
  repeat: "none" | "daily" | "weekly" | "monthly"   // only meaningful for type "custom"
  status: "pending" | "sent" | "cancelled" | "failed"
  sourceRef: { collection: string, id: string } | null   // null for "custom"
  recurrenceKey: string | null    // stable key so a regeneration pass can avoid duplicates
  deliveryAttempts: number
  lastError: string | null
  createdAt: timestamp
  updatedAt: timestamp             // set on any user edit, not only on send
  sentAt: timestamp | null
  cancelledAt: timestamp | null
}
```

`recurrenceKey` exists because recurring sources (a monthly debt payment, a goal's shrinking
countdown) get their next reminder regenerated rather than created fresh every time; the key
(for example `debt_payment_due:{debtId}:{yyyy-MM}`) lets the regeneration logic check "does this
month's reminder already exist, in any status" instead of creating duplicates, and, importantly,
instead of silently re-creating one the person just cancelled (Section 9.3).

### 2.4 Per-source reminder toggle (small addition to existing collections)

A person who wants to stop being reminded about one specific debt, without turning off debt
reminders for every debt, needs a switch that lives on the source, not on the reminder itself
(cancelling one occurrence, Section 9, only ever stops that one occurrence). This is a one-field
addition to schemas two other PRDs already own:

- `users/{uid}/debts/{debtId}.remindersEnabled: boolean` (default `true`), specced here as an
  addition to `PRD-GOALS-DEBT.md`'s existing debt schema.
- `users/{uid}/goals/{goalId}.remindersEnabled: boolean` (default `true`), same addition to that
  PRD's goal schema.

The write logic in Section 4 checks this flag before creating a new occurrence; it does not touch
any occurrence already scheduled, which is a person's own explicit per-occurrence decision either
way.

---

## 3. Notification types (v1 scope)

| Type | Fires on | Written from | Default timing |
|---|---|---|---|
| `debt_payment_due` | A debt's `paymentPlan.recurring.nextPaymentDate` | Inside the existing repayment write in `PRD-GOALS-DEBT.md` Section 2.3, same `runTransaction()` | N days before due (default 3, tunable) |
| `goal_deadline` | A goal's `deadline`, when a line item still has a `checkFrozenFundsAvailable` shortfall | Regenerated on goal write, and re-checked by the Section 5 sweep | 30 / 14 / 7 days before deadline |
| `budget_threshold` | `statsBudgetProgress` crossing 80% or 100% of a budgeted line item | Inside `createTransactionWithAggregation`, the same `runTransaction()` that already writes `statsBudgetProgress` | Immediate (`scheduledFor` = now) |
| `task_due` | A task's `dueDate` (once `PRD-PROJECTS.md` tasks exist) | Inside task create/edit write | Default N hours before, per-task override allowed |
| `custom` | A one-off or repeating reminder the person creates directly, unlinked to any Dreda record | The Create Reminder screen, Section 8.4 | Whatever the person picks |

Every type above writes into the same `scheduledNotifications` collection through the same
shape; nothing here introduces a new write pattern, only a new document written alongside a
write Dreda already performs (`debtPaymentDue`, `budgetThreshold`) or a lightweight regeneration
pass (`goalDeadline`), or, for `custom`, a direct write the person makes themselves.

`budget_threshold` is the one type that fires immediately rather than at a future instant; it
still flows through the same outbox and the same Section 5 sender, which keeps the delivery path
single, but it means the Section 5 sweep interval (Option A's 15-minute Apps Script trigger) is
also the worst-case latency for "you just went over budget," worth stating plainly since a
banking app's instant push and a 15-minute-delayed push read very differently to a household
watching their spending in real time.

**Editability differs by type**, detailed fully in Section 9: `custom` reminders are fully
editable and hard-deletable, since nothing else in Dreda derives from them. The other four types
are system-generated: their time can be rescheduled (a snooze) and the occurrence can be
cancelled, but their title and body are not directly editable, since they are derived from a
debt, goal, category, or task the person can already edit at its own source.

---

## 4. Client-side write logic

No new collection type introduces a new *pattern*; each system-generated notification type is
created at a point Dreda already writes, and each write first checks the source's own
`remindersEnabled` flag (Section 2.4):

```
// Inside the existing repayment/recurring-plan write (PRD-GOALS-DEBT.md Section 2.3)
if (paymentPlan.recurring.isActive && debt.remindersEnabled) {
  const reminderDate = subtractDays(nextPaymentDate, reminderLeadDays);
  const key = `debt_payment_due:${debtId}:${monthKey(nextPaymentDate)}`;
  const existing = await getByRecurrenceKey(key);   // any status: pending, sent, or cancelled
  if (!existing) {
    txn.set(scheduledNotificationRef, {
      type: "debt_payment_due",
      title: `Payment due soon: ${debtName}`,
      body: `${formatCurrency(recurring.amount)} due ${formatDate(nextPaymentDate)}`,
      scheduledFor: reminderDate,
      repeat: "none",
      status: "pending",
      sourceRef: { collection: "debts", id: debtId },
      recurrenceKey: key,
      deliveryAttempts: 0,
      lastError: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      sentAt: null,
      cancelledAt: null
    });
  }
}
```

```
// Inside createTransactionWithAggregation, right after statsBudgetProgress updates
const newPercent = newSpent / budgetedAmount;
if (newPercent >= 0.8 && previousPercent < 0.8 && category.remindersEnabled !== false) {
  const key = `budget_threshold:${categoryId}:${monthKey(date)}:80`;
  const existing = await getByRecurrenceKey(key);
  if (!existing) {
    txn.set(scheduledNotificationRef, {
      type: "budget_threshold",
      title: `${categoryName} is at ${Math.round(newPercent * 100)}% of budget`,
      body: `${formatCurrency(newSpent)} of ${formatCurrency(budgetedAmount)} spent this month`,
      scheduledFor: serverTimestamp(),
      repeat: "none",
      status: "pending",
      sourceRef: { collection: "categories", id: categoryId },
      recurrenceKey: key,
      deliveryAttempts: 0,
      lastError: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      sentAt: null,
      cancelledAt: null
    });
  }
}
```

Checking `getByRecurrenceKey` against **any** status, not only `pending`, is what keeps a
person's cancellation (Section 9) from being silently undone the next time this write logic
runs; a cancelled occurrence's key stays "claimed" so nothing recreates it, while the next
period's key is always different and generates normally.

Goal deadline reminders (`goal_deadline`) do not fit neatly into a single write, since a goal can
sit untouched for weeks while its deadline quietly gets closer. These regenerate on a lighter
schedule: whenever the Goals screen is opened (mirroring the Calendar bridge's "not real-time,
refreshed on screen open" pattern from the architecture doc), and again inside the Section 5
sweep as a backstop for a goal nobody has looked at in a month, subject to the same
`remindersEnabled` check and the same any-status recurrence key guard.

`custom` reminders skip all of this: they are written once, directly, by the person, from the
Create Reminder screen (Section 8.4), with no regeneration pass unless `repeat` is set to
something other than `"none"` (Section 9.1 covers how a repeating custom reminder regenerates
its next occurrence once the current one sends).

---

## 5. Delivery (Option A: Apps Script sweep)

```
function sendDueNotifications() {
  const dueDocs = queryFirestoreRest(
    "scheduledNotifications",
    { status: "pending", scheduledFor_lte: now() }
  );

  for (const doc of dueDocs) {
    const devices = getDevicesForUser(doc.uid);
    if (respectingQuietHours(doc.uid, now())) {
      continue; // leave it pending, do not mark sent, try again next sweep
    }
    for (const device of devices) {
      const result = sendFcmMessage(device.token, doc.title, doc.body);
      if (result.ok) {
        markSent(doc.id);
        if (doc.type === "custom" && doc.repeat !== "none") {
          scheduleNextOccurrence(doc);   // Section 9.1
        }
      } else if (result.error === "UNREGISTERED") {
        removeDevice(doc.uid, device.id);
      } else {
        incrementAttempt(doc.id, result.error);
      }
    }
  }
}
```

Querying only `status == "pending"` means a cancelled or already-sent document is never picked
up by the sweep; cancellation (Section 9) is entirely a client-side status change that this
sender simply respects on its next pass.

Registered as a time-driven trigger (`ScriptApp.newTrigger('sendDueNotifications').timeBased()
.everyMinutes(15).create()`), independent of any signed-in session. This is the one piece of
Dreda that runs whether or not anyone opens the app, which is exactly why Section 1.3's decision
matters: everything in this section changes shape under Option B (a Cloud Function on a Cloud
Scheduler cron, using the Admin SDK instead of a hand-built JWT and REST calls) or Option C (the
vendor's own scheduling API, no Apps Script code at all).

---

## 6. Registration and permission flow

- Notification permission must be requested from a real user gesture (a button tap in Settings,
  Section 8), never on page load; browsers silently ignore or auto-deny permission prompts fired
  without one.
- On iOS, push notifications for a home-screen PWA require iOS 16.4 or later, and only work once
  the app has actually been added to the home screen (installed, standalone display mode); a
  person testing this in a normal Safari tab will see the permission prompt do nothing useful.
  This is worth a visible note in the Settings UI (Section 8), not just a footnote here, since
  it is the single most common way this feature will look "broken" during testing.
- The existing service worker (already registered for offline/PWA behavior) gains a `push` event
  listener calling `self.registration.showNotification(title, { body, data: { url } })`, and a
  `notificationclick` listener that focuses or opens the app at `data.url` (the relevant debt,
  goal, budget, or reminder screen).
- On successful permission grant, the client calls Firebase Messaging's `getToken()` (VAPID key
  configured project-side) and writes the resulting token into `users/{uid}/devices/{deviceId}`.
  `deviceId` is a locally generated stable id (stored the same offline-sync-layer way iOS auth
  state already is, per the auth persistence architecture), not the FCM token itself, since
  tokens rotate and the device document needs to survive a rotation by being updated in place.

---

## 7. Firestore rules

```
match /users/{uid}/devices/{deviceId} {
  allow read, write: if request.auth.uid == uid;
}

match /users/{uid}/notificationSettings {
  allow read, write: if request.auth.uid == uid;
}

match /users/{uid}/scheduledNotifications/{notificationId=**} {
  allow read: if request.auth.uid == uid;
  allow create: if request.auth.uid == uid && request.resource.data.uid == uid;
  allow update: if request.auth.uid == uid && resource.data.uid == uid;
  allow delete: if request.auth.uid == uid;
}
```

These rules already permit the client to update or delete its own reminders outright; nothing
here needs to change for Section 9's CRUD operations to work. The rules do not distinguish "the
person editing their own custom reminder" from "the person editing a system-generated one's
derived title," the same coarse, client-trusted enforcement every other Dreda collection uses
(the architecture doc's own noted trade-off for a single-user-per-account app); Section 9's
editability rules are enforced in the UI and client logic, not in `firestore.rules`.

Under Option A, the Apps Script sweep does not write through these rules at all; it authenticates
as a service account outside Firebase Auth entirely, which is precisely the new trust boundary
flagged in Section 1.3. These rules only govern what the client itself may do.

---

## 8. UI/UX specification

### 8.1 Notification Settings screen

```
[Back]  Notifications

Push notifications                              [Toggle: On]
  iOS: add Dreda to your home screen first, then enable
  this from within the installed app.

Quiet hours                                      [Toggle: On]
  From [22:00]  to  [07:00]
  Notifications due in this window wait until it ends.

Remind me about:
  [x] Debt payments coming due
  [x] Goal deadlines at risk
  [x] Budget thresholds (80% and 100%)
  [ ] Task due dates

[Manage reminders]                    <- opens the Reminders list, Section 8.3

This device
  iPhone (this device)          Registered Aug 2, 2026
  [Remove this device]
```

- Master toggle off suppresses every type regardless of the per-type checkboxes underneath; the
  per-type list stays visible but disabled, so a person re-enabling later does not have to
  re-pick every type.
- "This device" lists only the device currently in use (its own `devices` document), not every
  registered device across the household's phones and laptops; a full multi-device management
  list is deferred (Section 12).

### 8.2 Notification permission prompt (in-context, not a modal on load)

Placed as a dismissible card on the Home screen for a household that has never granted
permission, rather than an automatic browser prompt on first load:

```
[Card]
  Get notified before bills are due
  Turn on notifications so Dreda can remind you before
  a debt payment or budget limit hits.
  [Enable notifications]   [Not now]
```

Tapping "Enable notifications" is the user gesture that triggers the real permission request
(Section 6); "Not now" dismisses the card without ever calling the browser API, which matters
because calling the permission API and getting denied burns the one prompt a browser will ever
show without the person changing a system setting by hand.

### 8.3 Reminders list (Read)

Reached from "Manage reminders" in Section 8.1. This is the one screen that lists every
reminder in `scheduledNotifications`, system-generated and custom together.

```
[Back]  Reminders                                    [+]

[Upcoming] [Sent] [Cancelled]

Upcoming
  Payment due soon: Personal Loan from Brother
    Sep 12, 2026, 9:00 AM        Debt payment       [>]
  Buy a New Car: 2 items still short on funds
    Sep 18, 2026, 9:00 AM        Goal deadline       [>]
  Pick up prescription refill
    Sep 6, 2026, 6:00 PM         Custom, weekly      [>]

  (swipe a row left for Snooze / Cancel, or Snooze / Edit / Delete for Custom)
```

- Default tab is "Upcoming" (`status == "pending"`, sorted by `scheduledFor` ascending).
- "Sent" and "Cancelled" tabs exist mainly so a person can answer "did I actually get reminded
  about that," not as a primary workflow; both are read-only history, no swipe actions.
- The `[+]` button opens Create Reminder (Section 8.4); it always creates a `custom` reminder,
  since system-generated types are created automatically from their source, never from this
  screen directly.
- Tapping any row opens Edit Reminder (Section 8.5) for a `custom` reminder, or a lighter
  Reschedule/Cancel sheet (Section 8.5) for a system-generated one.
- Each row's type label ("Debt payment," "Goal deadline," "Custom, weekly") is what tells the
  person which kind of edit they'll get before they tap in.

### 8.4 Create Reminder (Create)

```
[Back]  New Reminder                                [Save]

Title*
  [Text input: "Pick up prescription refill"]

Note
  [Text area, optional]

Date and time*
  [Date picker]   [Time picker]

Repeat
  [Dropdown: None / Daily / Weekly / Monthly]

[Save]
```

- Only reachable from the `[+]` button on the Reminders list (Section 8.3); there is no
  system-generated equivalent of this screen, since those reminders are always created from
  their source (a debt, a goal, a budget category).
- Saving writes one `scheduledNotifications` document with `type: "custom"`, `sourceRef: null`,
  and the chosen `repeat` value (Section 9.1 covers how a repeating one regenerates).

### 8.5 Edit Reminder / Reschedule (Update)

Two variants of the same screen, depending on the reminder's type:

**Custom reminder** (fully editable, same fields as Create):

```
[Back]  Edit Reminder                               [Save]

Title*
  [Text input]

Note
  [Text area]

Date and time*
  [Date picker]   [Time picker]

Repeat
  [Dropdown: None / Daily / Weekly / Monthly]

[Cancel this reminder]   [Delete reminder]
[Save]
```

**System-generated reminder** (title and body shown read-only, only the time is editable):

```
[Back]  Payment due soon: Personal Loan from Brother

This reminder is generated from a debt. To change what
it says, edit the debt itself.
[Open debt: Personal Loan from Brother]

Remind me at
  [Date picker]   [Time picker]

[Cancel this reminder]
[Save]
```

- Editing a system-generated reminder's time only reschedules when the household is told about
  it, never the underlying due date on the debt, goal, or task itself; Section 10 states this
  explicitly as an edge case worth getting right in copy, not just in code.
- "Cancel this reminder" is the only destructive action offered for a system-generated reminder;
  there is no "Delete" option for these, for the reason given in Section 9.3 (deleting outright
  would remove the recurrence-key guard and let the next regeneration pass silently recreate the
  very reminder the person just removed).

### 8.6 Cancel and delete (Delete)

- **Cancel** (available for every type): sets `status: "cancelled"`, `cancelledAt: serverTimestamp
  ()`. The document is kept, moves to the "Cancelled" tab in Section 8.3, and its
  `recurrenceKey` (if any) stays claimed so the write logic in Section 4 will not recreate the
  same occurrence.
- **Delete** (available only for `custom` reminders, or for any reminder already `sent` or
  `cancelled`, as history cleanup): permanently removes the document. Never offered for a
  `pending` system-generated reminder, since that document is the only thing stopping its own
  regeneration.
- Both actions are reachable from a swipe gesture on the Reminders list (Section 8.3) as well as
  from the Edit screen (Section 8.5), so a person does not have to open a reminder just to cancel
  it.

---

## 9. CRUD operations: rules and backend logic

This section is the single source of truth for what "editable" and "deletable" mean per type,
referenced by Sections 3, 4, and 8 above.

### 9.1 Create

Only `custom` reminders are created directly by the person, from Section 8.4:

```
function createCustomReminder(uid, { title, body, scheduledFor, repeat }) {
  return addDoc(scheduledNotificationsRef(uid), {
    type: "custom",
    title,
    body,
    scheduledFor,
    repeat,
    status: "pending",
    sourceRef: null,
    recurrenceKey: null,
    deliveryAttempts: 0,
    lastError: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    sentAt: null,
    cancelledAt: null
  });
}
```

When a repeating `custom` reminder sends (Section 5), the sweep calls a small helper before
moving on:

```
function scheduleNextOccurrence(sentDoc) {
  const nextDate = addInterval(sentDoc.scheduledFor, sentDoc.repeat);
  return createCustomReminder(sentDoc.uid, {
    title: sentDoc.title,
    body: sentDoc.body,
    scheduledFor: nextDate,
    repeat: sentDoc.repeat
  });
}
```

Each occurrence of a repeating custom reminder is therefore its own document; editing or
cancelling one occurrence (Section 9.2, 9.3) never touches occurrences that haven't been created
yet.

### 9.2 Read

The Reminders list (Section 8.3) is a single query per tab:

```
query(scheduledNotificationsRef(uid), where('status', '==', 'pending'), orderBy('scheduledFor', 'asc'))
query(scheduledNotificationsRef(uid), where('status', '==', 'sent'), orderBy('sentAt', 'desc'), limit(50))
query(scheduledNotificationsRef(uid), where('status', '==', 'cancelled'), orderBy('cancelledAt', 'desc'), limit(50))
```

No new index is required beyond Firestore's default single-field indexes, which cover an
equality filter plus an orderBy on a different field automatically.

### 9.3 Update

| Field | `custom` | System-generated (`debt_payment_due`, `goal_deadline`, `budget_threshold`, `task_due`) |
|---|---|---|
| `title` / `body` | Editable | Not editable directly; edit the source (debt, goal, category, task) instead |
| `scheduledFor` | Editable | Editable (a reschedule/snooze of this one occurrence only) |
| `repeat` | Editable | Not applicable; these regenerate from their source's own recurrence, not from `repeat` |
| `status` (cancel) | Editable | Editable |

```
function updateReminder(uid, notificationId, updates) {
  // For system-generated types, the client UI (Section 8.5) only ever sends
  // { scheduledFor } or { status: "cancelled", cancelledAt } here; title/body
  // are never included in the update payload for those types, enforced in the
  // UI layer rather than in firestore.rules (Section 7).
  return updateDoc(scheduledNotificationRef(uid, notificationId), {
    ...updates,
    updatedAt: serverTimestamp()
  });
}
```

Rescheduling a system-generated reminder's `scheduledFor` does not touch `recurrenceKey`; the
occurrence is still "claimed" under the same key, so Section 4's write logic still will not
create a duplicate for that period even though the time has moved.

### 9.4 Delete and cancel

```
function cancelReminder(uid, notificationId) {
  return updateDoc(scheduledNotificationRef(uid, notificationId), {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function deleteReminder(uid, notificationId, type, status) {
  const deletable = type === "custom" || status === "sent" || status === "cancelled";
  if (!deletable) {
    throw new Error("Cancel this reminder instead of deleting it.");
  }
  return deleteDoc(scheduledNotificationRef(uid, notificationId));
}
```

Cancelling is always safe for every type. Deleting is restricted to exactly the cases in Section
8.6, guarded here in the client logic as well as in the UI, so the rule survives even if a future
screen calls this function from somewhere other than Section 8.5's Edit screen.

---

## 10. Edge cases and validation

- **Invalid or expired FCM token**: the sweep (Section 5) removes the device document on an
  `UNREGISTERED` response rather than retrying it forever; the person simply stops getting
  notifications on that device until they open the app again and re-grant (which issues a fresh
  token).
- **Quiet hours**: a notification due inside quiet hours is left `pending`, not `cancelled`, and
  is sent on the next sweep after quiet hours end, so nothing silently disappears.
- **Duplicate prevention**: `recurrenceKey` (Section 2.3) is the guard; the write logic (Section
  4) checks for an existing document under that key, in any status, before creating a new one
  for the same source and period. This is also what makes cancellation stick (Section 9.3).
- **Cancelling does not disable future occurrences**: cancelling this month's debt payment
  reminder only removes this month's; next month's is a different `recurrenceKey` and will still
  generate normally. A person who wants to stop being reminded about a specific debt or goal
  altogether uses that source's own `remindersEnabled` toggle (Section 2.4), not repeated
  cancellation.
- **Rescheduling a system-generated reminder does not move its source's due date**: snoozing
  when you're told about a debt payment is not the same as moving the payment itself; the UI
  copy in Section 8.5 says this directly to avoid the household assuming otherwise.
- **Multiple devices, one household member**: a phone and a laptop both registered means both
  receive the same notification; deduplicating "seen on one device, don't show on the other" is
  out of scope for v1 (Section 12).
- **Permission revoked after being granted**: the next send attempt against that token fails with
  `UNREGISTERED` or similar, cleaned up the same way as an expired token; there is no separate
  "permission revoked" signal Dreda can detect proactively, since browsers do not notify a page
  when its own permission is revoked out from under it.
- **Timezone changes**: `notificationSettings.timezone` is read at the moment a reminder's
  `scheduledFor` is computed, not re-evaluated afterward; a household member who travels and
  changes timezones mid-cycle keeps existing reminders on their originally-computed instant,
  only new ones pick up the new timezone. Worth a one-line note in the UI if this becomes
  confusing in practice, not a v1 blocker.
- **Apps Script quota**: personal Google accounts cap total daily trigger runtime; a single
  household's notification volume (a handful of sends a day at most) sits far under any
  realistic quota, but this is worth a passing check once real usage exists, not an assumption to
  leave unchecked indefinitely.
- **Editing or cancelling a reminder the Apps Script sweep is about to send**: last-write-wins,
  no locking. If the person cancels a reminder in the few seconds before a 15-minute sweep would
  have sent it, the sweep's own `status == "pending"` filter simply excludes it on that pass;
  acceptable for a single-user-per-account app, the same trust-model tradeoff already recorded
  for every other unlocked write in this project.

---

## 11. Integration points

- `PRD-GOALS-DEBT.md` Section 7 and `PRD-ANALYTICS.md` Section 6 both named this feature as
  deferred; this PRD is what unblocks building `debt_payment_due` and `budget_threshold` for
  real, on top of data both PRDs already write (`paymentPlan.recurring`, `statsBudgetProgress`).
- `task_due` depends on `PRD-PROJECTS.md`'s task schema existing first; nothing here needs to
  change once that ships, since Section 3's table already reserves the type and timing.
- Tapping a delivered notification, or a row in the Reminders list, deep-links into the same
  screens `PRD-GOALS-DEBT.md` and `PRD-ANALYTICS.md` already specify (Debt detail, Goal detail,
  the filtered Budget/category view), reusing existing routes rather than building new ones.
- `remindersEnabled` (Section 2.4) is a small addition owed to `PRD-GOALS-DEBT.md`'s debt and
  goal schemas; worth folding into that PRD's own document the next time it is touched, rather
  than leaving the field specced only here.

---

## 12. Not in scope (deferred)

- Rich, actionable notification buttons (for example "Mark as paid" directly from the
  notification tray), which needs the service worker to handle a `notificationclick` action and
  write back to Firestore without the app ever opening; a real v2 candidate once the basic pipe
  works.
- Multi-device management beyond "remove this device" (renaming devices, seeing every device
  across the household from one screen).
- Bulk actions on the Reminders list (cancel or delete several at once); v1 is one row at a time.
- SMS or email as a fallback channel if push fails.
- Digest/batching mode (one daily summary instead of several separate pushes), a natural
  follow-on once real usage shows whether separate pushes feel noisy.
- Android- or desktop-specific notification features beyond FCM's default behavior.

---

## 13. Open decisions (confirm before or during build)

1. **Delivery mechanism** (Section 1): Apps Script plus FCM HTTP v1 (recommended, no plan
   change, real new code), Blaze plus Cloud Functions and Cloud Scheduler (textbook, needs a
   plan upgrade), or a third-party push vendor (least code, new external dependency). This is the
   one decision the rest of the implementation depends on; everything else in this PRD is written
   against the first option but the schema in Section 2 works under any of the three.
2. **Default reminder lead times**: 3 days for debt payments, 30/14/7 for goal deadlines, both
   assumed in Section 3 and worth tuning once the household sees them against real dates rather
   than deciding blind now.
3. **Platform rollout order**: whether v1 ships for iOS first (the flagship platform per the
   architecture doc, and the platform with the most permission-flow subtlety, Section 6) or all
   platforms at once.
4. **Quiet hours scope**: one global window (as specced in Section 2.2 and 8.1) versus a
   per-type override; v1 assumes global only.
5. **Cancelled-reminder retention**: whether cancelled documents are kept indefinitely (as
   written in Section 9.4) or pruned after some period; kept indefinitely is simplest and matches
   the low volume expected, worth revisiting only if the Cancelled tab ever feels cluttered.

---

## 14. Summary

| | Debt payment due | Goal deadline | Budget threshold | Task due | Custom |
|---|---|---|---|---|---|
| **Trigger** | `nextPaymentDate` approaching | Deadline approaching with a funding shortfall | `statsBudgetProgress` crosses 80%/100% | `dueDate` approaching (needs `PRD-PROJECTS.md`) | Person taps `[+]` on the Reminders list |
| **Created by** | System, at write time | System, on screen open plus sweep | System, at write time | System, at write time | Person, directly |
| **Title/body editable** | No, edit the source | No, edit the source | No, edit the source | No, edit the source | Yes |
| **Time editable** | Yes (this occurrence only) | Yes (this occurrence only) | Yes (this occurrence only) | Yes (this occurrence only) | Yes |
| **Cancellable** | Yes, soft cancel | Yes, soft cancel | Yes, soft cancel | Yes, soft cancel | Yes, soft cancel |
| **Hard deletable** | No | No | No | No | Yes |
| **Turn off future ones** | Debt's `remindersEnabled` toggle | Goal's `remindersEnabled` toggle | Settings type toggle | Settings type toggle | Delete or stop the repeat |
