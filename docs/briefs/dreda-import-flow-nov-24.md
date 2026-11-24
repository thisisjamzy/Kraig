# Claude Code brief: the task import flow, from file to finished (24 November 2026)

Paste everything below the line into Claude Code, with the repo open at `Kraig/app`.

A copy of this brief lives in the repo at `Kraig/docs/briefs/` with the other Claude Code briefs.

What this covers: one proper flow for importing tasks. After a file is uploaded the user sees its tasks in a table, ticks the ones to bring in (or ticks all), sees exactly how many tasks and database writes the import will take before pressing Start, then watches each task go in: it is ticked off and fades, chunk by chunk, under a real progress bar. Stopping keeps what is in (or removes it), because the writes go in chunks of 20. This brief **replaces** `claude/dreda-import-progress-brief.md` (written earlier today and not built).

The owner's rules for this flow (24 November):

- **Only tasks are imported.** One row in the file is one task. Areas, folders and projects are never uploaded as rows of their own and cannot be bulk created. If a task names an area, folder or project that does not exist yet, it is created as part of importing that task.
- **Every task belongs to an area, a folder and a project.** A task cannot be imported without all three. There are no Inbox tasks from an import (this changes the 23 November rule that sent rows with no area, folder or project to the Inbox, and the rules that filled a blank folder with the area's default folder and a blank project with a project named after the folder).
- **There is no parent and child chain.** A task has no child records (its subtasks are checklist lines stored inside the task document, `subtasks`, not tasks), and the table is a flat list of tasks. Nothing is skipped because something else failed.
- Chunks of 20 tasks.

Where the owner did not settle a detail, this brief picks a default and marks it **Default**; the defaults are repeated at the end.

---

You are working in the Dreda Next.js PWA at `Kraig/app`. Read `claude/dreda-project-handover.md` (section 3) and `AGENTS.md` first.

House rules: UK English, no em dashes anywhere (copy, comments, commit messages), semantic tokens only, v1.0 components where they exist (Button, Checkbox, Chip/Tag, Progress, Table rows). Logic in `src/logic` and `src/shared`, never in components. Every new Firestore field optional with a safe default. Check at 320px, 375px, 768px, 1024px and 1440px, Light and Dark.

## 0. Where it is today (read on 24 November; confirm before you build)

- The task import is `src/forms/ImportTasksForm/ImportTasksForm.tsx` with `src/logic/importData/useTaskImport.ts` and `src/shared/import/taskList.ts`. Steps `upload`, `columns`, `check`, `importing`, `done`. It is opened from Tasks, Projects, an area and a project.
- It writes areas, then folders, then projects, then tasks, each group through a `commit()` helper in `writeBatch`es of 450 (`BATCH = 450`). `ensureDefaultSection` for new areas writes outside the batches.
- Why the user sees "Importing… 0 of 1" on a blank page: `commit()` **adds to the total as each group of writes starts** (`total: p.total + ops.length`), so the total is never known up front and jumps between groups, and with batches of 450 nothing moves until a whole batch lands. The count is of write operations, not tasks. There is no list of what went in and no way to stop.
- Undo exists: it deletes created tasks and projects and archives created folders and areas, from the log under `users/{uid}/settings/import-{id}`.

Out of scope: the Settings > Data workbook import (Money entities) and Full restore. Leave both as they are.

## 1. The flow

Five steps, shown in a step indicator at the top with the current one highlighted:

1. **Upload**: as today (drop zone, or "Choose file" on phone; the template link).
2. **Columns**: only when the headers do not match the template, as today.
3. **Review and select**: the file's tasks in a table, with checkboxes (section 2). This replaces the current `check` step and keeps everything it does (date reading, "Did you mean", problem rows fixed in place, duplicates, time clashes).
4. **Ready to import**: every count known, and **Start import** (section 3).
5. **Importing**, then **Finished**: the live table, progress bar, stop, keep or remove, report (sections 5 to 7).

Back is available on steps 2 to 4 and keeps the user's choices.

## 2. Review and select

### 2.1 The table

- One flat table of tasks, one row per row of the file, in file order.
- Columns: checkbox, **Task**, **Area**, **Folder**, **Project**, **Due**, **Time**, **Priority**, **Status**, **Row** (the spreadsheet row number), **Check** (a tag: Ready, Needs a look, Duplicate, Time clash). Notes, Repeats, Subtasks and Tags show in a row's detail when it is opened, not as columns.
- **Area, Folder, Project and Task are required on every row.** A row missing any of them is "Needs a look", with the empty cell outlined in `status/error` and the reason in words ("Which folder is this in?"). The cell is editable: a picker of the existing areas, folders (within the chosen area) and projects (within the chosen folder), with "Create new" at the bottom. The picker never offers a folder from another area or a project from another folder.
- Several rows at once: tick rows that need a look and use "Put in…" on the summary bar to set Area, Folder and Project for all of them in one go.
- Opened from an area, folder or project, that context fills the matching cells on rows that leave them blank, as today, and the summary bar says so ("Blank areas filled with Work"). Opened from Tasks or Projects with no context, nothing is filled in.
- Update `taskList.ts` to match: remove the Inbox route (`projectId: null`) and the default folder and folder-named project fallbacks from the import, make the three columns required in the template's "How to fill this in" sheet, and update the tests.
- An area, folder or project name that will be created shows a small "New" tag beside it in its cell. That is the only place new containers appear on this screen; they are not rows.
- Problem cells are editable in place; fixing a row turns it Ready. "Did you mean" choices apply to every row with that name, as today.
- Sort by any column; group by Area or Project is offered as a view only (it changes the display, not the data). Sticky header row and sticky first two columns. Virtualise once the table passes 200 rows.

### 2.2 Checkboxes

- A checkbox on every row, **Select all** in the header, and a summary bar above the table: "180 of 212 selected" with "Select all 212" and "Clear". In the grouped view a group header has a checkbox that ticks the tasks under it.
- Quick filters: All, Selected, Needs a look, Duplicates, Time clashes.
- **Default** starting selection: every Ready row ticked; rows that need a look are unticked and cannot be ticked until fixed; duplicates and time clashes are unticked but can be ticked (a ticked time clash uses the existing choice: free, without a time, or not at all).
- Selection survives Back and Next within the import.

## 3. Ready to import: everything counted before Start

Before any write, build the **plan** (section 4.1) from the ticked rows and show it on one screen:

```
Ready to import  tasks-november.xlsx

  Tasks          180 of 212 rows selected
  New places     1 area, 2 folders and 3 projects will be created for these tasks
  Database       189 writes in 9 chunks of 20 tasks
  Not imported   32 rows (14 unticked, 12 duplicates, 6 need a look)

  [ Back ]                                   [ Start import ]
```

- **Tasks**: the ticked rows.
- **New places**: the areas, folders and projects that will be created because ticked tasks name them, with "See which" listing them. Only those needed by ticked tasks: unticking the only task that names a new project removes that project from the plan.
- **Database writes**: the exact number of write operations the runner will perform, counted from the plan's operation list, not estimated. It includes each task, each new area, folder and project, each area's default folder from `ensureDefaultSection`, any other side writes the task write function makes, and the import log writes (one per chunk). Say in your report how each part is counted.
- **Chunks**: tasks divided by 20, rounded up.
- **Not imported**: rows left out, with the reasons; "See them" opens Review filtered to them.
- A note under the counts: "You can stop at any time. Tasks already in stay until you choose to keep or remove them."
- **Start import** is the only primary button, disabled when nothing is ticked.

## 4. The runner

`src/shared/import/importRunner.ts` (pure plan, chunk, stop and roll back logic, with Firestore calls passed in so it can be tested) and `src/shared/import/importLog.ts` (reading and writing the log).

### 4.1 Plan first

1. One plan item per ticked task, in file order. Each gets its Firestore id up front (`doc(collection(...)).id`), so it can be removed even if its write was in flight when the user pressed Stop.
2. Each new area, folder or project gets its id up front too and is attached to the **first** task in the plan that needs it. Its writes (and the default folder for a new area) go into that task's operations, so the place is created in the same chunk as that task. Later tasks that name it just use its id.
3. Each item holds `id`, `label` (the task title), `where` ("Work / Admin / Website"), `sourceRow`, `creates` (the ids of any places it brings with it), `ops` (its write operations), `status`, `error`.
4. The plan's totals feed section 3. The progress total is the number of tasks, fixed before the first write, and never changes during the run.
5. Move `ensureDefaultSection` into the plan so every write goes through the runner and is counted.

### 4.2 The import log is the source of truth

1. Create `users/{uid}/settings/import-{importId}` **before** the first write, with `fileName`, `startedAt`, `status: "running"`, the counts from section 3, and the items with `status: "waiting"`.
2. Over 400 items, keep items in `users/{uid}/settings/import-{importId}/items/{itemId}` so the log stays under the 1 MB document limit.
3. Mark a chunk's items `writing` before committing it and `imported` after, so a crash mid-chunk leaves the ids on record.
4. Log status values: `running`, `stopping`, `stopped`, `completed`, `rolling_back`, `rolled_back`, `failed`.

### 4.3 Chunks of 20

1. One `writeBatch` per chunk of 20 tasks, carrying those tasks and any places they bring with them.
2. Create each task through the same function the task form uses (`src/shared/firestore/taskWrites.ts` / `newTaskDoc`), with `importId` added, as today. No hand-built objects.
3. If a chunk fails, its tasks are marked `failed` with the reason in plain words, and the run carries on with the next chunk. Any new place that failed with that chunk is attached to the next task in the plan that needs it, so later tasks can still create it. No task is skipped because another failed.
4. "Retry failed" (section 5.4) runs only the failed tasks again as a new set of chunks under the same import.

## 5. Importing: the live table

Replace the "Importing… 0 of 1" panel with this, in the same place (side peek on web, full screen on phone).

### 5.1 Header

- Title "Importing" and the file name.
- A real **progress bar** (v1.0 Progress, `action/primary` fill) with "84 of 180 tasks imported" and the percentage. It counts tasks, never write operations.
- Small counters under it: Imported, Waiting, Failed; elapsed time and "about 1 minute left", estimated from the average chunk time once two chunks have committed.
- The progress line is an `aria-live="polite"` region, updated once per chunk.

### 5.2 The table

The ticked tasks in plan order, with columns Status, Task, Where, Due, Row, Note.

Status per row: Waiting (empty circle, `text/muted`), Importing (spinner), Imported (tick in `status/success`), Failed (cross in `status/error`, reason in Note), Removing (spinner), Removed (struck through, grey). A task that brought a new place shows "Created Admin folder" in Note once imported.

### 5.3 The animation the owner asked for

1. When a chunk starts, its 20 rows turn to Importing (spinner) together.
2. When the chunk commits, its rows turn to Imported **one at a time, about 40ms apart, top to bottom**: the spinner becomes a tick that draws in (a stroke animation of about 200ms), the row flashes `status/success-subtle` once, then **fades to 55% opacity** and stays in place, ticked. Failed rows do not fade; they stay at full strength with the red cross.
3. The table keeps the current chunk in view (smooth scroll, about a third of the way down), unless the user has scrolled the table themselves; then a "Jump to current" pill appears at the bottom.
4. Update React state once per chunk and drive the stagger with CSS (`transition-delay` per row index in the chunk), animating only `opacity` and `transform`, so a 2,000-row import stays smooth.
5. With `prefers-reduced-motion: reduce`: no stagger, flash, stroke animation or smooth scroll; rows switch straight to ticked and faded.
6. Filters above the table: All, Imported, Failed, Waiting.

### 5.4 Footer, by state

| State | Buttons and text |
| --- | --- |
| Running | "Stop import" (Secondary) |
| Stopping | "Stopping after this chunk…" (no buttons) |
| Stopped, or X pressed while running | "Keep 84 imported" (Secondary) and "Remove 84 imported" (Destructive) |
| Rolling back | "Removing 31 of 84" with the bar running backwards; no buttons |
| Completed | "Done" (Primary) with links to the projects the tasks went into, as today; "Undo import" (Ghost); "Retry 3 failed" when there are failures; "Download report" (Ghost) when anything failed or was left out |
| Rolled back | "Close", with "Nothing from this file is left in Dreda" |

## 6. Stopping, closing and rolling back

1. "Stop import" sets the log to `stopping`. The chunk already committing finishes (a committed batch cannot be cancelled); no further chunk starts; the log becomes `stopped`. The table stays, with what got in ticked and faded, and the keep or remove choice.
2. Pressing X, leaving the page or closing the tab while running behaves as Stop: a `beforeunload` warning and a route change guard while running.
3. Roll back ("Remove imported", and "Undo import" later) removes only tasks whose ids are in this import's log **and** that carry this `importId`, in chunks of 20, newest chunk first, through the app's existing task delete function. Rows animate the other way: Removing, then Removed.
4. Then the places the import created: a project, folder or area created by this import is removed only if nothing outside this import is in it. **Default:** such places are deleted (an area with its default folder); a place that has gained anything else since is left, and the report says so. This replaces the current rule of archiving folders and areas.
5. A delete that fails shows on its row with "Try again"; the import is not `rolled_back` until every created task is gone.

## 7. Picking up after a crash or a closed tab

When the import opens and finds a log with status `running`, `stopping` or `rolling_back`, show a banner: "An import of tasks-november.xlsx stopped part way. 84 of 180 tasks were imported." with "Resume", "Remove imported" and "Keep what's there". Items marked `writing` are checked against Firestore (does the task exist?) before any of the three.

## 8. Phone

- Review and select: below 600px the table becomes a list. Each row: checkbox, task title, and a second line with "Area / Folder / Project" and the due date; a missing part shows as "No folder" in `status/error`; the Check tag on the right when it is not Ready. The summary bar ("180 of 212 selected", Select all) sticks under the header. Tapping a row opens it in a sheet to read or fix.
- Ready to import: the counts as a stacked list, one per line; Start import full width, fixed to the bottom.
- Importing: the same list with the status icon on the left; progress bar and counters stick to the top; footer buttons stick to the bottom; the same tick and fade.
- Every tap target at least 44px; status icons carry text labels for screen readers.

## 9. Where the code goes

- `src/shared/import/importRunner.ts` and `importLog.ts` (section 4).
- `src/widgets/ImportFlow/`: the step indicator, the review table with selection (`ImportReviewTable`), the plan summary (`ImportPlanSummary`) and the live table (`ImportProgress`).
- Rewire `useTaskImport.ts` and `ImportTasksForm.tsx` to them. Remove the `progress` state that grows as it goes, the 450 batch size and the "Importing…" paragraph.

## 10. Tests

In `test/importRunner.test.ts`:

1. A file of 180 ticked tasks naming 1 new area, 2 new folders and 3 new projects: the plan counts 180 tasks and the exact number of writes, and that number equals the writes the runner performs.
2. Each new place is written in the same chunk as the first task that names it; unticking the only task that names a new project drops the project from the plan.
3. The run writes in chunks of 20 and reports 20, 40, … 180; the total never changes during the run.
4. Stop after the second chunk: exactly 40 tasks written, log `stopped`.
5. Roll back after that stop: the 40 tasks are removed, then the new places that are now empty; nothing else touched; log `rolled_back`.
6. A failed chunk marks its 20 tasks failed, the run continues, and a new project that failed with it is created with the next task that names it.
7. A crash with a chunk marked `writing`: recovery finds which tasks exist.
8. A row with no area, no folder or no project is "Needs a look" and cannot be ticked; every imported task has `projectId`, `bucketId` and `areaId` set and matching its project's.

Then by hand: import a file of 60 tasks naming a new area, folder and project, with a few problem rows including some with a blank folder or project; fix them with "Put in…"; untick ten; check the counts on Ready to import; start; watch the rows tick and fade; stop at about half; remove; and confirm Tasks, Projects and the area list look exactly as before.

## Report back

Any differences from section 0; files changed and created; new Firestore fields and paths; how each part of the write count is worked out; anything left undone.

## Defaults for the owner to confirm

1. Every Ready row starts ticked; rows that need a look start unticked and must be fixed first; duplicates and time clashes start unticked.
2. Imported rows tick, flash once and fade to 55%, about 40ms apart; failed rows stay at full strength.
3. On roll back, areas, folders and projects created by the import are deleted if nothing else is in them, instead of archived.
