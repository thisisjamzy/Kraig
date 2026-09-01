# Dreda: projects, areas, resources, and a kanban board (PARA)

## 1. Relationship to the other PRDs, and what changed since the last version

This replaces the previous `PRD-PROJECTS.md` in full. It builds on `PRD-FIREBASE.md` and on the
real, deployed shape of the app, not the shape `PRD-FIREBASE.md` originally proposed. Two things
changed underneath this document since it was last written, and every section below assumes them:

The household chose to stay on Firebase's Spark (free) plan, so there are no deployed Cloud
Functions. `functions/` still exists and still passes its own emulator tests, but nothing in it
runs in production. Every place the previous version of this document said "an `onWrite` Cloud
Function trigger maintains this," the real app instead does that work client-side, inside a
`runTransaction()` call at the moment of the write, the exact pattern `src/shared/firestore/
aggregation.ts` already established for the ledger. This document follows that same pattern for
projects and tasks rather than reintroducing Cloud Functions for one feature when the rest of the
app already proved the client-side approach works.

Every collection is a subcollection of `users/{uid}`, not a shared, single-household top-level
collection. Each sign-up gets its own private data, enforced by `firestore.rules`'s `activeUser()`
check and `request.auth.uid == uid` on every path. Nothing in this document introduces multi-user
sharing (there isn't any in the ledger either yet); every `projects`, `tasks`, `areas`, and
`resources` reference below is `users/{uid}/<collection>`.

The app itself is now called Dreda, not Kraig. This document uses that name throughout.

This is also, again, a UI document and not only a backend one. Section 9 names the exact existing
card, list-row, chip, and modal shapes every new screen reuses, read directly from the current
repo (`src/styles/base/globals.css`, `HomeScreen`, `BudgetScreen`, `Wallets`, `BottomNav`,
`Modal`), the same discipline the previous version of this PRD adopted after its first, backend-
only draft.

## 2. Goals

Organize projects and tasks the way a person actually thinks about their whole life, not only
work: Areas of ongoing responsibility (Health, Home, Finances, a job, a relationship), Projects
with a real end (repaint the fence, plan a trip, file taxes), Resources worth keeping around for
reference (a saved Drive link, a note, a contact), and an Archive for anything no longer active.
This is the PARA method, and it becomes Dreda's actual organizing model for anything that is not
a ledger transaction, not a loose add-on next to it.

A working kanban board per project: real drag-and-drop between columns on a touch screen, not a
static list with a status dropdown pretending to be one.

A place to save a Google Drive link (or any link) against an area, a project, or a task, so the
household is not hunting through Drive's own search to find the deed scan or the shared trip
itinerary later.

A calendar the app owns, time blocking, a shareable booking link, and a real two-way bridge to
the household's actual Google Calendar, carried over from the previous version of this document
and corrected in sections 17 and 18 for the Spark-plan reality described in section 1.

Everything mobile-first, in the literal sense the rest of the app already commits to: a single
column layout inside `--app-max-width` (480px), touch targets sized for a thumb, no feature in
this document that only makes sense on a wide screen (see section 4 on the desktop split-screen
idea specifically).

## 3. Non-goals

Not a team tool. This stays one household's own projects and tasks, the same single-account-per-
user scope the ledger already has. No assignee field, no comments-with-@mentions, no shared
board across accounts.

No full Gantt chart or critical path analysis. A project's planned and actual end dates are
tracked (section 15) and a task can name one blocking predecessor (section 14), but a dependency
graph and a computed critical path are a real feature in their own right, one this household's
day-to-day use does not call for. Reconsidered in section 4.

No hourly billing, invoicing, or client-facing reports. There are no clients. Reconsidered in
section 4.

No Google Drive Picker or Drive API integration this pass. Saving a link is pasting a URL, not
browsing Drive from inside Dreda. Section 13 explains the trade-off.

No true background sync with Google Calendar. Section 17 explains why the pull direction runs
when the household opens the Calendar screen (or asks it to refresh), not continuously in the
background, and why that is an acceptable trade-off for a personal calendar rather than a team's.

No drag-to-reschedule on the calendar grid itself. Section 16 keeps the quick-edit sheet as the
one way to reschedule, same as the previous version of this document; the kanban board is where
this document's drag-and-drop budget goes.

## 4. Reviewing the reference feature spec

The pasted brief describes a tool built for a different job: a solo freelancer running client
projects. Some of it is a real fit once translated to a household's own life; some of it solves a
problem Dreda does not have. Point by point:

**Automated scheduling from durations and dependencies, with Finish-to-Start and Start-to-Start
dependency types.** Adopted, narrowed. A task can name one predecessor it depends on (section 14),
Finish-to-Start only (task B cannot start until task A is done), the common real case. Start-to-
Start and a multi-predecessor graph are a real feature for a project with a dozen interlocking
contractors, not for "buy the paint before you can paint the fence." Left out, with the door open
if it turns out to matter later.

**A critical path analysis toggle.** Not adopted. Critical path answers "which chain of tasks is
actually delaying the finish," a question a coordinator asks when tasks are contended for a
shared team's time. A household project has no team to coordinate against, only its own calendar,
already covered by the calendar bridge and the suggested-slot feature in section 14.

**Fixed project expenses, hourly billing rates, and profit margin tracking.** Half adopted.
Billing rates and profit margin assume a client paying for time, which does not apply here. But
Dreda already has a real ledger sitting right next to this feature, so section 15 lets a task or
project link to the actual transactions that paid for it and shows a running "spent so far"
figure pulled from real money, not a parallel budget the household would have to keep in sync by
hand.

**A baseline snapshot to measure schedule and budget slippage.** Simplified, not dropped. A full
baseline freezes the entire plan (every task's dates, cost, and scope) at a point in time. Section
15 keeps the useful part, one immutable planned end date compared against the current one, and
skips freezing a whole plan tree no one but a project manager doing formal earned-value reporting
would read.

**A Gantt chart view and a client-facing dashboard export (PDF or web link).** Not adopted. Both
exist to communicate progress to someone who is not the person doing the work. There is no such
person here. If that changes, a read-only status link is the natural extension of the pattern
booking links already establish (section 18), not a new mechanism.

**A calendar dashboard for booking, updating, and canceling meetings without leaving the app; and
availability as a hard constraint, automatically shifting unfinished tasks into the next open
block.** Mostly already covered. Section 16 is that calendar dashboard. The "hard constraint,
automatic shift" idea is adopted as a suggestion, not an automatic move: section 14's "find a free
slot" surfaces two or three open windows computed against the real calendar and the household
picks one. Silently moving a task on someone's behalf, without them noticing, is the wrong trust
model for a personal planner even if it is a reasonable one for a scheduling engine managing a
team's time.

**A split-screen desktop layout, schedule on the left, calendar availability on the right.** Not
adopted, on grounds that apply to every feature in this document, not only this one: Dreda is
mobile-first, single column, `--app-max-width` locked. Section 16's month-plus-agenda view is the
same information in the one-column shape the rest of the app already uses.

## 5. The organizing model: PARA, mapped to Dreda

Areas are the top level: an ongoing part of life with no finish line (Health, Home, a job). A
project belongs to an area or stands alone. A task belongs to a project, or directly to an area
with no project (a recurring area-level chore, "renew the car insurance," never really "done" the
way a project is), or stands fully alone. A resource, a saved link or note worth keeping, can
attach to an area, a project, a task, or nothing at all, a personal shelf of reference material.
Archive is not a fifth collection, it is where anything above goes once it stops being active:
`archived: true` on the area, the project, or the resource itself, the same "archive in place,
never hard-delete" convention `accounts`, `categories`, and `budgetRules` already use.

This does not replace or touch `PaymentsCalendar`, the ledger's own upcoming-bills view; that
stays a Money-mode screen about due dates on transactions, unrelated to the Projects-mode calendar
this document specs in section 16.

## 6. Planned databases, at a glance

All of the following are subcollections of `users/{uid}`, alongside the ledger's own
(`accounts`, `categories`, `transactions`, `transfers`, `budgetRules`, `plannedPayments`,
`settings`, `budgetPlans`, `exchangeRates`). Full field lists in section 7.

| Collection | PARA role | Key fields | Written by |
|---|---|---|---|
| `areas/{areaId}` | Area | `name`, `color`, `archived` | Client, direct write |
| `projects/{projectId}` | Project | `name`, `areaId`, `plannedEndDate`, `endDate`, `status`, `color`, `kanbanColumns` | Client, direct write |
| `tasks/{taskId}` | belongs to a project and/or area | `projectId`, `areaId`, `parentTaskId`, `statusColumnId`, `dueDate`, `scheduledStart/End`, `dependsOnTaskId`, `linkedTransactionId` | Client, direct write |
| `resources/{resourceId}` | Resource | `title`, `url`, `kind`, `areaId`, `projectId`, `taskId` | Client, direct write |
| `calendarEvents/{eventId}` | supports Projects and Areas | `type`, `start`, `end`, `source`, `googleCalendarEventId` | Client, direct write (manual events and task blocks written inline with the task write, see section 8) |
| `bookingLinks/{linkId}` | supports Projects and Areas | `slug`, `durationMinutes`, `availabilityRules` | Client, direct write |
| `statsProjectsHome` (doc) | | `todayCount`, `scheduleThisWeekCount`, `activeProjectCount`, `allTaskCount` | Client, inside the same `runTransaction()` as the write that changed it |
| `statsPerProject/{projectId}` (doc) | | `taskCount`, `subtaskCount`, `completedCount` | Client, same pattern |

Client-generated ids as the document id, same convention as the ledger (`PRD-FIREBASE.md` section
7), for every collection here.

A deliberate simplification from the previous version of this document: there is no separate
`bookings` collection. Section 18 explains why a confirmed booking needs no Firestore write of
its own at all under the Spark-plan design.

## 7. Full data model

```ts
interface FirestoreArea {
  id: string;
  name: string;
  color: string; // one of the existing palette swatches, same picker as project color
  notes?: string;
  archived: boolean;
  createdAt?: Timestamp;
}

interface FirestoreKanbanColumn {
  id: string;
  label: string;
}

interface FirestoreProject {
  id: string;
  name: string;
  areaId: string | null;
  color: string;
  plannedEndDate: Timestamp | null; // set once, immutable after first save, see section 15
  startDate: Timestamp | null;
  endDate: Timestamp | null; // the current target, can move
  status: 'Active' | 'Completed' | 'Archived';
  kanbanColumns: FirestoreKanbanColumn[]; // defaults to To Do / In Progress / Done, see section 12
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface FirestoreTask {
  id: string;
  title: string;
  projectId: string | null;
  areaId: string | null; // set directly when projectId is null, otherwise mirrors the project's areaId
  parentTaskId: string | null; // subtask
  statusColumnId: string; // must match one of the project's kanbanColumns ids, or a fixed default set for area-only tasks
  dueDate: Timestamp | null;
  scheduledStart: Timestamp | null;
  scheduledEnd: Timestamp | null;
  calendarEventId: string | null; // the mirrored calendarEvents doc, see section 16
  dependsOnTaskId: string | null; // Finish-to-Start only, see section 14
  estimatedCost: number | null;
  linkedTransactionId: string | null; // see section 15
  tags: string[];
  archived: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface FirestoreResource {
  id: string;
  title: string;
  url: string;
  kind: 'drive' | 'link'; // detected client-side from the URL host, see section 13
  areaId: string | null;
  projectId: string | null;
  taskId: string | null;
  notes?: string;
  archived: boolean;
  createdAt?: Timestamp;
}

interface FirestoreCalendarEvent {
  id: string;
  type: 'TaskBlock' | 'Event' | 'Reminder' | 'Milestone';
  title: string;
  start: Timestamp;
  end: Timestamp;
  source: 'app' | 'google' | 'booking';
  taskId: string | null;
  projectId: string | null;
  googleCalendarEventId: string | null;
  createdAt?: Timestamp;
}

interface FirestoreBookingLink {
  id: string;
  slug: string;
  label: string;
  durationMinutes: number;
  availabilityRules: { weekday: number; startMinute: number; endMinute: number }[];
  active: boolean;
  createdAt?: Timestamp;
}

interface StatsProjectsHome {
  todayCount: number;
  scheduleThisWeekCount: number;
  activeProjectCount: number;
  allTaskCount: number;
  lastUpdated?: Timestamp;
}

interface StatsPerProject {
  taskCount: number;
  subtaskCount: number;
  completedCount: number;
  lastUpdated?: Timestamp;
}
```

## 8. Client-side aggregation, the same pattern as the ledger

`createTransactionWithAggregation` in `src/shared/firestore/aggregation.ts` is the model to
mirror, not a Cloud Function trigger to reintroduce. New functions in the same file:

`createTaskWithAggregation(input, uid)`: inside one `runTransaction()`, writes the task doc,
increments `statsProjectsHome.allTaskCount` and (if today or this week) the matching counts, and
increments `statsPerProject/{projectId}.taskCount` (and `.subtaskCount` if `parentTaskId` is set)
when the task belongs to a project. If `scheduledStart`/`scheduledEnd` are set on creation, also
writes the mirrored `calendarEvents` doc in the same transaction and stores its id back onto the
task, the client-side equivalent of the previous version's `onTaskWrite` trigger.

`updateTaskWithAggregation(input, previous, uid)`: takes the task's previous snapshot (already
held by the caller, since every list is a live `onSnapshot` subscription) so it can apply the same
delta discipline `PRD-FIREBASE.md` section 6 already specced for the ledger: a task moving from
one project to another decrements the old project's `statsPerProject` and increments the new
one's, never a naive single-bucket delta; a status change into or out of "Done" adjusts
`completedCount`; a change to `scheduledStart`/`scheduledEnd` updates the mirrored
`calendarEvents` doc in the same transaction rather than deleting and recreating it.

`deleteTaskWithAggregation` (archive in place, same convention as the rest of the app): decrements
the counts the create incremented, and deletes the mirrored `calendarEvents` doc if one exists.

`statsProjectsHome`'s "today" and "this week" counts need a small daily correction the ledger's
stats never needed: a task due today does not stop being due today because no write happened at
midnight. The Projects home screen recomputes those two fields with a lightweight `getDocs`
query (not the live-incremented value) whenever it mounts and the last `lastUpdated` is not from
today, the same kind of "recompute after the fact, cheaply, because a pure write-time counter
cannot know time has passed" case `statsBudgetProgress` already has for month rollover.

## 9. UI outline: reusing the existing design system

No new tokens, no new component library beyond the one addition in section 20. Every screen below
composes what already exists: the CSS custom properties in `globals.css` (`--space-xs` through
`--space-4xl`, `--radius-sm/md/lg/full`, `--font-size-sm/md/lg/xl/2xl`, `--color-background/
surface/text-primary/text-secondary/border/brand/danger`, `--ink-bg/surface/border/text/text-
secondary`), and the same shapes every existing screen already builds from: the bordered card
(`.totalCard`/`.categoryRow`), the surface list row (`.paymentRow`, title left, meta right), the
uppercase section header with a circular dark "view all" button (`.sectionTitle` +
`.viewAllButton`), the pill tab group (`.periodTab`/`.periodTabActive`), the dashed ghost "add
new" button (`.addCategoryButton`), the bordered list container (`Wallets`'s `.list`/`.row`), and
the bottom sheet (`Modal`, used for every create/edit surface in the app). Every color reference
in this document names one of these tokens.

## 10. New and changed screens

**`ProjectsScreen`** (`src/screens/Projects/ProjectsScreen.tsx`), Projects mode's Home
equivalent, and the PARA hub described fully in section 11.

**`ProjectDetailScreen`** (`src/screens/ProjectDetail/ProjectDetailScreen.tsx`), a full-screen
drill-down route, `/projects/[project]`, added to `chromeVisibility.ts`'s no-bottom-nav list the
way `/wallets/[wallet]` already is, back-arrow header instead of `AppHeader`. Header block:
project name, color dot, area chip (if any), date range, a status pill. A stat row styled like
`WalletDetailScreen`'s summary row (task count, subtask count, completed count). A List/Board
toggle styled like `.periodTab`/`.periodTabActive`, List showing the same grouped-by-status task
rows the previous version of this document specced, Board showing the kanban view from section 12.
A Resources section at the bottom (section 13). Tapping a task opens the quick-edit sheet.

**`AreaDetailScreen`** (`src/screens/AreaDetail/AreaDetailScreen.tsx`), `/areas/[area]`, same
drill-down convention. Shows the area's own projects (as `.categoryRow` cards) and its area-level
tasks (tasks with `areaId` set and `projectId` null) in one `.paymentRow` list below them, plus
its Resources section.

**`CalendarScreen`** (`src/screens/Calendar/CalendarScreen.tsx`), Projects mode's second root
tab, `/calendar`. Full detail in section 16.

**Task quick-edit sheet**: a `Modal` titled "Edit Task," fields styled like `BudgetScreen`'s form
fields. Status as a horizontally scrollable row of the project's kanban columns (or a fixed
default set for an area-only task), due date and scheduled start/end as native date/time inputs,
a "depends on" picker limited to other tasks in the same project, a "find a free slot" action
(section 14), an optional linked-transaction picker (section 15), a save button styled like
`.modalSaveButton` including its disabled state.

**Resource quick-add sheet**: a small `Modal`, title, a single URL field, an auto-detected Drive
icon versus a generic link icon (section 13), an optional note.

**Booking link management**: inside `SettingsScreen`, unchanged from the previous version of
this document.

**Public booking page** (`app/book/[slug]/page.tsx`): unchanged in shape from the previous
version, its backend is corrected in section 18.

## 11. The Areas / Projects / Resources / Archive home screen

`ProjectsScreen` opens on an Overview row (2x2 grid, `.totalCard`-styled tiles: Today, This
Week, Projects, All Task, reading `statsProjectsHome`), unchanged from the previous version. Below
it, a four-way segmented tab row styled exactly like `.periodTab`/`.periodTabActive`: **Areas**,
**Projects**, **Resources**, **Archive**. This is the whole PARA method made literal and
navigable, without adding a fourth bottom-nav slot the app has never had (section 8 of the earlier
version, unchanged: nav stays two root tabs in Projects mode, this segmented row lives inside the
first one).

**Areas tab**: each area a `.categoryRow` card, its color dot, its own project and task counts,
tapping opens `AreaDetailScreen`. "New Area" as an `.addCategoryButton`-styled dashed button.

**Projects tab**: the project list from the previous version of this document, unchanged, each
project showing its area as a small chip next to its name when it has one.

**Resources tab**: every non-archived resource across the whole account, not scoped to one area
or project, each a `.paymentRow` with the Drive or link icon, its title, and a small caption
naming what it's attached to ("Home renovation" or "unattached"). "New Resource" opens the quick-
add sheet from section 10 with no area/project/task preselected.

**Archive tab**: every archived area, project, and resource, grouped under three `.sectionTitle`
headers, each row a muted `.paymentRow` with a single "Restore" action that flips `archived` back
to `false`. This is PARA's fourth category made real rather than an implicit "things with a flag
you'd have to know to filter for."

## 12. Kanban board

Each project stores its own ordered `kanbanColumns` (`FirestoreKanbanColumn[]`), defaulting to
To Do, In Progress, Done on project creation, editable from the project detail screen (rename,
reorder, add, remove, a small settings sheet reusing the `Modal` pattern). A task's
`statusColumnId` references one of its project's column ids, never a raw label, so renaming a
column never silently disconnects a task from it.

The board itself, `ProjectDetailScreen`'s Board tab: one horizontally scrollable row of columns,
each a fixed-width (`--space-4xl` * 3, roughly 288px) vertical list, column header styled like
`.sectionTitle`, task cards inside styled like a compact `.categoryRow` (title, due date if set, a
small dependency-blocked badge if `dependsOnTaskId` points at a task not yet in the Done column).
Dragging a card to another column updates `statusColumnId` through `updateTaskWithAggregation`
(section 8), including its `completedCount` delta when the destination or source is the Done
column.

Touch drag-and-drop on a horizontally scrolling row is the one place this document reaches for a
library rather than building on bare CSS: `@dnd-kit/core` plus `@dnd-kit/sortable`, chosen over
building this by hand because reliable touch drag with auto-scroll near a screen edge is a real,
previously-solved problem, not something worth re-deriving, and because dnd-kit has no legacy
dependency on the HTML5 drag events API, which behaves poorly on mobile Safari, the exact
environment this app targets. See section 20.

Cross-project or cross-area boards are out of scope this pass (section 3); the board is always
one project at a time.

## 13. Saving Google Drive and other links (Resources)

A resource is a title, a URL, and an optional attachment to an area, a project, or a task. The
client classifies a URL as `kind: 'drive'` when its host is `drive.google.com`, `docs.google.com`,
`sheets.google.com`, or `slides.google.com`, and shows a Drive icon instead of a generic link
icon; everything else is `kind: 'link'`. Tapping a resource opens the URL in a new tab or the
system share sheet, same as any external link elsewhere in the app.

The deliberate scoping decision: this is paste-a-link, not browse-and-pick. A real Google Drive
Picker needs its own OAuth scope beyond what Dreda already requests for Calendar, and Google's own
verification requirements get stricter as an app requests more sensitive scopes, real cost for a
feature whose whole job is "remember this link exists." If browsing Drive from inside the app
turns out to matter later, the Picker is a contained addition on top of this same `resources`
collection, not a redesign of it.

Resources show up in three places: the project or area detail screen's Resources section (scoped
to that project or area, plus any resource whose `taskId` points at one of that project's tasks),
the task quick-edit sheet (a small "Links" list with an inline add), and the account-wide
Resources tab in section 11.

## 14. Task dependencies and suggested scheduling

`dependsOnTaskId`, a single optional predecessor, Finish-to-Start: the dependent task shows a
small "blocked by [task title]" badge on its card and row whenever the predecessor's
`statusColumnId` is not that project's Done column. This is a soft warning, not an enforced
block; the household can still move the dependent task forward if the real world doesn't care
what Dreda thinks the order should be, the same non-bureaucratic instinct behind not hard-
enforcing anything else in this app.

"Find a free slot," a button in the quick-edit sheet's scheduling section, appears once a task has
a `dueDate` or the household opens the scheduling fields directly. It reads the already-loaded
`calendarEvents` for the next seven days (the same data the Calendar screen renders, no extra
network call), computes gaps of at least the task's estimated duration (a simple `estimatedCost`-
adjacent `estimatedMinutes` field, defaulting to 30) between 8am and 9pm local time, and offers
two or three of them as tappable chips. Picking one fills `scheduledStart`/`scheduledEnd`; saving
still goes through the normal task update path in section 8. This is the reference spec's
"treat availability as a hard constraint" idea, kept, deliberately made a suggestion the household
approves rather than something Dreda decides silently on their behalf (section 4).

## 15. Tying tasks and projects to the ledger

`estimatedCost` on a task is a plain number the household types in while planning, no unit
conversion, no link to any account.

`linkedTransactionId` on a task is an optional pointer to a real `transactions/{id}` doc. The
task quick-edit sheet's linked-transaction picker lists the household's own recent transactions
(reusing the same account/category read the Add Transaction screen already does) so a task like
"buy paint for the fence" can point at the real transaction once it's been paid, rather than
Dreda keeping a second, parallel ledger someone has to remember to update by hand. `ProjectDetail-
Screen`'s stat row adds a "Spent so far" figure, the sum of every linked transaction's amount
across that project's tasks, styled like `.totalCard`'s number treatment. This never writes back
to the transaction itself, the relationship is one-directional, a task pointing at a transaction,
not a transaction knowing about a task.

`plannedEndDate` is set once, on project creation, and never changes after. `endDate` is the
project's current target and can move as reality changes. `ProjectDetailScreen`'s header shows
"On track" when they still match, or "N days behind plan" (styled like `.errorText`'s color, not
its weight) when `endDate` has moved later than `plannedEndDate`. This is the whole of what this
document adopts from "baseline snapshot," one immutable date compared against the live one,
deliberately not a frozen copy of the entire task tree (section 4).

## 16. Calendar views and management

Carried over from the previous version of this document, corrected only in how the mirrored
`calendarEvents` doc gets written (section 8's client-side transaction, not a Cloud Function
trigger) and in how Google-side changes flow back in (section 17).

**Month view**: a 7-column grid, today styled with the same active-fill treatment
`.periodTabActive` already uses, up to three small dots per day for that day's `calendarEvents`,
colored by the linked project's `color`, or `--color-text-secondary` at low opacity (the same
`color-mix` treatment `.placeholderBar` already uses) for an item with no project. Selecting a
day scrolls the agenda below into view on the same screen.

**Day agenda**: a chronological list for the selected day, rows shaped like `.paymentRow`, icon
per `calendarEvents.type` (`lucide-react`'s `CheckSquare` for a `TaskBlock`, `Calendar` for an
`Event`, `Bell` for a `Reminder`, `Flag` for a `Milestone`), time range styled like `.paymentDate`.
A `TaskBlock` row deep-links to that task; any other row opens a quick-edit `Modal` for that
`calendarEvents` doc directly.

**Managing events**: creating one is the FAB's Projects-mode action (unchanged from the previous
version's section 8) when Calendar is the active screen. Editing opens the same sheet pre-filled.
Deleting is a destructive action styled like `.iconButtonDanger`. A manually created event writes
directly (`source: 'app'`), then the client calls the Apps Script push endpoint (section 17)
itself, right after the Firestore write, rather than a trigger doing it.

Both views read `calendarEvents` with an `onSnapshot` listener scoped to the visible date range,
a Firestore index on `(start)` covers this.

## 17. The Google Calendar bridge, corrected for the Spark plan

Why Apps Script at all, unchanged from the previous version: this household's calendar is a
personal Google account, not Workspace, so there's no service-account shortcut, and Apps Script's
`CalendarApp` already runs as the household's own already-authorized identity. What changes here
is who talks to Firestore, since there is no Cloud Function left to do it from the server side.

**Push (app to Google)**: no longer trigger-driven. Right after the client writes a manual event
or a task's scheduled block (section 8, 16), it calls the Apps Script web app endpoint directly
(same shared-secret-in-body scheme the original ledger backend used), Apps Script creates or
updates the matching `CalendarApp` event and returns its Google event id in the HTTP response, the
client writes that id onto `calendarEvents.googleCalendarEventId` in a second, small update. This
is simpler than the trigger-based version, not only a workaround, the same "the client does the
whole round trip itself, synchronously" shape `aggregation.ts` already uses everywhere else.

**Pull (Google to app)**: also no longer a background job. `CalendarScreen`, on mount, and a
manual pull-to-refresh, call a `listChanges` Apps Script endpoint (same shared secret) which reads
`Calendar.Events.list` with a stored sync token and returns the diff as JSON. The client applies
that diff directly into its own `calendarEvents` subcollection with an ordinary, already-
authenticated Firestore write, since it's the household's own signed-in session doing it, no
Admin SDK or service account bypass needed anywhere in this flow. The honest trade-off, stated
plainly: an event created or moved directly on Google Calendar shows up in Dreda the next time
the household opens the Calendar screen, not the instant it happens. Acceptable for one person's
own planner; revisit only if this ever needs to feel like a live, always-synced calendar app.

Loop prevention, unchanged in principle: every push-created event already carries its
`googleCalendarEventId`, so `listChanges`'s diff is computed by Apps Script itself against events
it already knows it created, and the client additionally skips any incoming event whose id already
matches a `calendarEvents.googleCalendarEventId` it already has, tagged `source: 'google'` only
for genuinely new Google-side events.

## 18. Booking links, corrected for the Spark plan

Also corrected from the previous version's design, which assumed two public Cloud Functions. With
no Cloud Functions deployed, and no way for an anonymous visitor to write into `users/{uid}`
under `firestore.rules`'s real `activeUser()` check, the booking flow moves entirely into Apps
Script, the one piece of this whole feature that already runs outside Firestore's own security
boundary by design.

`getAvailability` and `submitBooking` become two more actions on the same Apps Script web app
from section 17, not new Cloud Functions. `getAvailability` reads the `bookingLinks` doc's
`availabilityRules` (fetched by the public booking page directly from Firestore, `bookingLinks`
stays a normal, publicly-readable-by-slug document, nothing sensitive in it) and cross-references
open slots against `CalendarApp.getEvents` directly, no Firestore read on the Apps Script side at
all. `submitBooking` re-checks the slot is free and calls `CalendarApp.createEvent` directly,
tagging the new event with an extended property (`sourceApp: 'dreda-booking'`) so section 17's
`listChanges` can set `source: 'booking'` instead of `'google'` when it next pulls that event in.

The result: a confirmed booking never needs its own Firestore write from an unauthenticated
visitor, and never needs a separate `bookings` collection. It becomes visible in Dreda exactly the
way any other Google-side calendar change does, the next time the household opens the Calendar
screen, this time already labeled as a booking rather than an ordinary event. This is a real
simplification over the previous design, not only a Spark-plan workaround, one fewer collection,
one fewer write path to secure, one fewer thing that could get the two sides out of sync.

## 19. Security Rules additions

New `match` blocks under `users/{uid}` in `firestore.rules`, same shape as every existing one:

```
match /areas/{areaId} {
  allow read, create, update: if activeUser() && request.auth.uid == uid;
  allow delete: if false; // archive in place
}
match /projects/{projectId} {
  allow read, create, update: if activeUser() && request.auth.uid == uid;
  allow delete: if false;
}
match /tasks/{taskId} {
  allow read: if activeUser() && request.auth.uid == uid;
  allow create: if activeUser() && request.auth.uid == uid
    && request.resource.data.createdBy == request.auth.uid;
  allow update: if activeUser() && request.auth.uid == uid;
  allow delete: if activeUser() && request.auth.uid == uid;
}
match /resources/{resourceId} {
  allow read, create, update: if activeUser() && request.auth.uid == uid;
  allow delete: if false;
}
match /calendarEvents/{eventId} {
  allow read, create, update, delete: if activeUser() && request.auth.uid == uid;
}
match /bookingLinks/{linkId} {
  allow read, create, update: if activeUser() && request.auth.uid == uid;
  allow delete: if false;
}
match /statsProjectsHome/{docId} {
  allow read, write: if activeUser() && request.auth.uid == uid;
}
match /statsPerProject/{projectId} {
  allow read, write: if activeUser() && request.auth.uid == uid;
}
```

`bookingLinks`'s doc content has to be readable by the public booking page too, by slug, without
the visitor being signed in. That page is a separate Next.js route calling Firestore with a
narrower, explicitly-scoped query (`where('slug', '==', slug)` against a doc shape with nothing
sensitive in it, no household name, no other collection reachable from it) rather than a change to
the rule above; a second `match` clause allowing unauthenticated read only on that one collection,
scoped by a Cloud Firestore rule matching the query shape, is the precise addition, written and
tested alongside the actual booking page rather than speculatively here.

## 20. Libraries

`@dnd-kit/core` and `@dnd-kit/sortable`, the one new dependency in this document, justified in
section 12. Nothing else new: no calendar UI library (section 16 builds directly on the existing
token system, same as the previous version of this document), no Drive API client (section 13),
no date library beyond what the app already does its own date math with elsewhere.

## 21. Testing

`aggregation.ts`'s new task functions get the same kind of test the transaction functions already
have (or should have) against the Firebase Local Emulator Suite: create, then edit across
projects, then delete, asserting `statsProjectsHome` and `statsPerProject` land on the right
numbers after each step, the delta-discipline cases from section 8 specifically (a project move,
a status change into and out of Done).

The Apps Script bridge is tested the way `sheets/Code.gs` originally was: copied into a plain
`.js` file, `CalendarApp` and `UrlFetchApp` mocked, one explicit test per action (`push`,
`listChanges`, `getAvailability`, `submitBooking`), plus the loop-prevention case from section 17:
push an event, simulate `listChanges` seeing that same event back, confirm it is not treated as a
new Google-side change.

Firestore Rules tested with `@firebase/rules-unit-testing`, the same harness `test/firestore-
rules.test.ts` already uses for the ledger, extended with the new collections from section 19,
including the explicit case of a second, unauthenticated user attempting to read another
account's `tasks` or `resources` and being denied.

## 22. Acceptance criteria

Creating an area, a project inside it, and a task inside that project shows the task under both
the project and the area, and the Overview tiles update immediately. Switching a project's Board
tab to List and back preserves every task in its correct column. Dragging a task card to another
column on a touch device (not only a mouse) updates its status and, when the destination is Done,
its project's completed count, without a page reload. Saving a Drive link against a task shows it
in that task's Links list, in the project's Resources section, and in the account-wide Resources
tab, with the Drive icon distinguishing it from a plain link. Archiving a project moves it out of
the Projects tab and into the Archive tab, and Restoring it from there brings it back exactly as
it was. Setting a task's scheduled start and end makes it appear on the Calendar screen and, once
section 17 is deployed, on the real Google Calendar within one push round trip. Booking a slot on
the public booking page as a signed-out visitor results in a real Google Calendar event and,
after the household next opens the Calendar screen, a matching `calendarEvents` doc tagged
`source: 'booking'`, with no Firestore write ever made by that signed-out visitor. Every new
screen visually passes as belonging to the app in a side-by-side comparison with `HomeScreen`,
`BudgetScreen`, and `Wallets`.

## 23. Build order

1. `areas`, `projects`, `tasks`, and their Security Rules; the Areas, Projects, and Archive tabs
   on `ProjectsScreen`, `AreaDetailScreen`, and `ProjectDetailScreen`'s List view; no board, no
   calendar, no Google integration yet.
2. `statsProjectsHome` and `statsPerProject`, the client-side aggregation functions from section
   8, wired to the Overview tiles and per-project stat rows.
3. `resources`, the Resources tab, the quick-add sheet, and the Links section on tasks and
   project/area detail screens.
4. The kanban board: `kanbanColumns` on projects, the drag-and-drop board view, `@dnd-kit`
   wired in.
5. Task dependencies (the blocked badge) and "find a free slot," both fully client-side, no
   backend change needed for either.
6. `linkedTransactionId` and `estimatedCost`, the "spent so far" figure, `plannedEndDate` and the
   on-track/behind-plan indicator.
7. `calendarEvents`, the task-block mirroring from section 8, the Calendar screen (month plus day
   agenda), all Google-independent so this is fully testable before touching Apps Script.
8. The Apps Script bridge (section 17), push direction first, then `listChanges`, then the
   loop-prevention test.
9. Booking links end to end (section 18), depends on step 8.
10. Full acceptance pass per section 22.
