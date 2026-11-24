// The task import's runner and log (app/src/shared/import/importRunner.ts,
// importLog.ts; brief 24 Nov 2026, the task import flow, section 10).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planTaskList, type ExistingLists, type PlanOptions } from '../app/src/shared/import/taskList';
import { buildImportPlan, CHUNK, rollbackImport, runImport, settleWriting, type PlanDocs, type RollbackIO } from '../app/src/shared/import/importRunner';
import { planFromLog, type ImportPlan, type StoredLog, type StoredPage, type WriteOp } from '../app/src/shared/import/importLog';

const today = { y: 2026, m: 11, d: 24 };
const existing: ExistingLists = {
  areas: [{ id: 'work', name: 'Work' }],
  folders: [
    { id: 'default-work', name: 'General', areaId: 'work', isDefault: true },
    { id: 'admin', name: 'Admin', areaId: 'work', isDefault: false },
  ],
  projects: [{ id: 'budget', name: 'Budget', areaId: 'work', bucketId: 'admin' }],
  tasks: [],
};
const options = (over: Partial<PlanOptions> = {}): PlanOptions => ({
  mapping: { Area: 'area', Folder: 'folder', Project: 'project', Task: 'task' },
  orders: {},
  today,
  nameChoices: {},
  edits: {},
  ...over,
});

const docs: PlanDocs = {
  area: (a) => ({ name: a.name, importId: 'imp' }),
  defaultFolder: (f) => ({ name: 'General', areaId: f.areaId, isDefault: true, importId: 'imp' }),
  folder: (f) => ({ name: f.name, areaId: f.areaId, importId: 'imp' }),
  project: (p) => ({ name: p.name, areaId: p.areaId, bucketId: p.folderId, importId: 'imp' }),
  task: (t, where) => ({ title: t.title, ...where, importId: 'imp' }),
};

/**
 * 180 tasks: 1 new area (Home) with 2 new folders (Garden, Repairs) and 3
 * new projects (Beds, Lawn, Roof); the rest go to Work / Admin / Budget.
 */
function file180() {
  const places = [
    ['Home', 'Garden', 'Beds'],
    ['Home', 'Garden', 'Lawn'],
    ['Home', 'Repairs', 'Roof'],
    ['Work', 'Admin', 'Budget'],
  ];
  // The new places first appear on rows 30, 31, 32 (indices), the rest is Work.
  return Array.from({ length: 180 }, (_, i) => {
    const [Area, Folder, Project] = i >= 30 && i < 33 ? places[i - 30] : i >= 33 && i % 4 !== 3 ? places[i % 4] : places[3];
    return { Area, Folder, Project, Task: `Task ${i + 1}` };
  });
}

function makePlan(rows: Record<string, unknown>[], over: Partial<PlanOptions> = {}): ImportPlan {
  const tasks = planTaskList(rows, existing, options(over));
  let n = 0;
  return buildImportPlan({
    uid: 'u',
    importId: 'imp',
    fileName: 'tasks.xlsx',
    tasks: tasks.tasks.filter((t) => t.include),
    nodes: { areas: tasks.areas, folders: tasks.folders, projects: tasks.projects },
    existingProjects: { budget: { areaId: 'work', bucketId: 'admin' } },
    newId: () => `id${++n}`,
    defaultFolderId: (a) => `default-${a}`,
    docs,
  });
}

/** A Firestore stand-in: a map of paths, and every batch it was sent. */
function fakeDb(failOn?: (ops: WriteOp[], n: number) => boolean) {
  const store = new Map<string, Record<string, unknown>>();
  const batches: WriteOp[][] = [];
  let n = 0;
  const io: RollbackIO = {
    now: () => 'now',
    async commit(ops) {
      n++;
      if (failOn?.(ops, n)) throw Object.assign(new Error('nope'), { code: 'unavailable' });
      batches.push(ops);
      for (const op of ops) {
        if (op.type === 'delete') store.delete(op.path);
        else if (op.type === 'set') store.set(op.path, { ...op.data });
        else store.set(op.path, { ...(store.get(op.path) ?? {}), ...op.data });
      }
    },
    async tasksWithImportId() {
      return new Set([...store.keys()].filter((p) => p.startsWith('users/u/tasks/')).map((p) => p.split('/').pop()!));
    },
    async isEmpty(place) {
      const key = place.kind === 'project' ? 'projectId' : place.kind === 'folder' ? 'bucketId' : 'areaId';
      const inside = [...store.entries()].filter(([p, d]) => d[key] === place.id && !p.endsWith(`/${place.id}`) && p !== `users/u/buckets/${place.defaultFolderId}`);
      return inside.length === 0;
    },
    async removePlace(place) {
      const kind = place.kind === 'area' ? 'areas' : place.kind === 'folder' ? 'buckets' : 'projects';
      store.delete(`users/u/${kind}/${place.id}`);
      if (place.defaultFolderId) store.delete(`users/u/buckets/${place.defaultFolderId}`);
    },
  };
  const tasks = () => [...store.keys()].filter((p) => p.startsWith('users/u/tasks/'));
  const writes = () => batches.reduce((s, b) => s + b.length, 0);
  return { io, store, batches, tasks, writes };
}

const noStop = { shouldStop: () => false };

describe('the plan', () => {
  test('1. 180 tasks with 1 new area, 2 folders and 3 projects: the counted writes are the writes performed', async () => {
    const plan = makePlan(file180());
    assert.equal(plan.counts.tasks, 180);
    assert.deepEqual([plan.counts.newAreas, plan.counts.newFolders, plan.counts.newProjects], [1, 2, 3]);
    assert.equal(plan.counts.chunks, 9);
    // 180 tasks; places: area 2 (with its General), folders 2, projects 3;
    // log: 1 log + 1 page, 9 chunks x 2 marks, 1 final status.
    assert.deepEqual(plan.counts.parts, { tasks: 180, places: 7, log: 1 + 1 + 18 + 1 });
    assert.equal(plan.counts.writes, 180 + 7 + 21);
    const db = fakeDb();
    assert.equal(await runImport(plan, db.io, noStop, { fresh: true }), 'completed');
    assert.equal(db.writes(), plan.counts.writes);
    assert.equal(db.tasks().length, 180);
  });

  test('2. a new place is written in the same chunk as the first task that names it; unticking its only task drops it', async () => {
    const plan = makePlan(file180());
    const roof = Object.values(plan.places).find((p) => p.name === 'Roof')!;
    const first = plan.items.find((i) => i.needs.includes(roof.id))!;
    assert.deepEqual(first.creates.includes(roof.id), true);
    const db = fakeDb();
    await runImport(plan, db.io, noStop, { fresh: true });
    const batch = db.batches.find((b) => b.some((op) => op.path === `users/u/tasks/${first.id}` && op.type === 'set'))!;
    assert.ok(batch.some((op) => op.path === `users/u/projects/${roof.id}`));

    // Roof is named by row 33 and every 4th row after; untick them all.
    const rows = file180();
    const ticked: Record<number, boolean> = {};
    rows.forEach((r, i) => {
      if (r.Project === 'Roof') ticked[i] = false;
    });
    const without = makePlan(rows, { ticked });
    assert.ok(!Object.values(without.places).some((p) => p.name === 'Roof'));
    // Repairs held only Roof, so it goes too.
    assert.ok(!Object.values(without.places).some((p) => p.name === 'Repairs'));
    assert.equal(without.counts.newProjects, 2);
  });
});

describe('running', () => {
  test('3. chunks of 20, reported 20, 40 … 180, and the total never changes', async () => {
    const plan = makePlan(file180());
    const seen: number[] = [];
    const totals = new Set<number>();
    const db = fakeDb();
    await runImport(plan, db.io, {
      shouldStop: () => false,
      onChunk: (s) => {
        seen.push(s.imported);
        totals.add(s.items.length);
      },
    }, { fresh: true });
    assert.deepEqual(seen, Array.from({ length: 9 }, (_, i) => (i + 1) * CHUNK));
    assert.deepEqual([...totals], [180]);
    // Each chunk's batch carries 20 tasks.
    const taskBatches = db.batches.filter((b) => b.some((op) => op.path.startsWith('users/u/tasks/')));
    assert.ok(taskBatches.every((b) => b.filter((op) => op.path.startsWith('users/u/tasks/')).length === CHUNK));
  });

  test('4. stop after the second chunk: exactly 40 tasks in, log stopped', async () => {
    const plan = makePlan(file180());
    let chunks = 0;
    const db = fakeDb();
    const end = await runImport(plan, db.io, { shouldStop: () => chunks >= 2, onChunk: () => chunks++ }, { fresh: true });
    assert.equal(end, 'stopped');
    assert.equal(db.tasks().length, 40);
    assert.equal(db.store.get('users/u/settings/import-imp')!.status, 'stopped');
  });

  test('5. roll back after that stop: the 40 go, then the places now empty; nothing else touched', async () => {
    // Home's places first appear inside the first 40 rows.
    const plan = makePlan(file180());
    let chunks = 0;
    const db = fakeDb();
    db.store.set('users/u/tasks/someone-else', { title: 'Mine', projectId: 'budget', areaId: 'work', bucketId: 'admin' });
    db.store.set('users/u/projects/budget', { name: 'Budget', areaId: 'work', bucketId: 'admin' });
    await runImport(plan, db.io, { shouldStop: () => chunks >= 2, onChunk: () => chunks++ }, { fresh: true });
    const before = new Set(db.store.keys());
    assert.ok([...before].some((p) => p.startsWith('users/u/areas/')));
    // The fake's own task, outside the import, is not one of "this import's" ids.
    const io = { ...db.io, tasksWithImportId: async () => new Set(plan.items.filter((i) => i.status === 'imported').map((i) => i.id)) };
    const removedOrder: number[] = [];
    const out = await rollbackImport(plan, io, { onChunkStart: (s) => removedOrder.push(Math.min(...s.current.map((id) => plan.items.find((i) => i.id === id)!.order))) });
    assert.equal(out.status, 'rolled_back');
    // Newest chunk first.
    assert.deepEqual(removedOrder, [20, 0]);
    assert.equal(db.tasks().length, 1);
    assert.ok(db.store.has('users/u/tasks/someone-else'));
    assert.ok(db.store.has('users/u/projects/budget'));
    assert.ok(![...db.store.keys()].some((p) => p.startsWith('users/u/areas/') || p.startsWith('users/u/buckets/')));
    assert.equal(db.store.get('users/u/settings/import-imp')!.status, 'rolled_back');
  });

  test('5b. a place that has gained something else is kept', async () => {
    const plan = makePlan(file180().slice(0, 40));
    const db = fakeDb();
    await runImport(plan, db.io, noStop, { fresh: true });
    const beds = Object.values(plan.places).find((p) => p.name === 'Beds')!;
    db.store.set('users/u/tasks/added-later', { title: 'Later', projectId: beds.id });
    const io = { ...db.io, tasksWithImportId: async () => new Set(plan.items.map((i) => i.id)) };
    const out = await rollbackImport(plan, io);
    assert.deepEqual(out.kept.map((k) => k.name).sort(), ['Beds', 'Garden', 'Home']);
  });

  test('6. a failed chunk marks its 20 failed, the run carries on, and a place that failed with it comes with the next task that needs it', async () => {
    const plan = makePlan(file180());
    // The chunk holding Home's first tasks (rows 30 to 32) is the second.
    let taskBatch = 0;
    const db = fakeDb((ops) => ops.some((op) => op.path.startsWith('users/u/tasks/')) && ++taskBatch === 2);
    await runImport(plan, db.io, noStop, { fresh: true });
    const failed = plan.items.filter((i) => i.status === 'failed');
    assert.equal(failed.length, 20);
    assert.ok(failed.every((i) => i.order >= 20 && i.order < 40 && i.error));
    assert.equal(db.tasks().length, 160);
    const beds = Object.values(plan.places).find((p) => p.name === 'Beds')!;
    assert.equal(beds.status, 'created');
    const carrier = plan.items.find((i) => i.created.includes(beds.id))!;
    assert.ok(carrier.order >= 40);
    // Retry failed: the 20 go in under the same import.
    const retry = await runImport(plan, db.io, noStop, { only: failed.map((i) => i.id) });
    assert.equal(retry, 'completed');
    assert.equal(db.tasks().length, 180);
  });

  test('7. a crash with a chunk marked writing: recovery finds which tasks exist', async () => {
    const plan = makePlan(file180().slice(0, 60));
    let taskBatch = 0;
    // The second chunk "crashes" after its writing mark: its batch never lands.
    const db = fakeDb((ops) => ops.some((op) => op.path.startsWith('users/u/tasks/')) && ++taskBatch === 2);
    let chunks = 0;
    await runImport(plan, db.io, { shouldStop: () => chunks >= 2, onChunk: () => chunks++ }, { fresh: true });
    // Read the log back as a reopened page would, with the second chunk left "writing".
    const log = db.store.get('users/u/settings/import-imp') as StoredLog;
    const page = db.store.get('users/u/settings/import-imp-items-0')!;
    const items = Object.fromEntries(Object.entries(page).filter(([k]) => k.startsWith('items.')));
    const stored: StoredPage = { items: {} };
    for (const [id, item] of Object.entries((page.items ?? {}) as Record<string, Record<string, unknown>>)) {
      stored.items![id] = { ...(item as never), status: (items[`items.${id}.status`] as never) ?? item.status } as never;
      if ((item.order as number) >= 20 && (item.order as number) < 40) stored.items![id].status = 'writing';
    }
    const back = planFromLog('u', 'imp', log, [stored]);
    assert.equal(back.items.filter((i) => i.status === 'writing').length, 20);
    // Five of them did get in after all.
    const landed = new Set(back.items.filter((i) => i.order >= 20 && i.order < 25).map((i) => i.id));
    await settleWriting(back, async (id) => landed.has(id) || db.tasks().includes(`users/u/tasks/${id}`));
    assert.equal(back.items.filter((i) => i.status === 'imported').length, 25);
    assert.equal(back.items.filter((i) => i.status === 'waiting').length, 35);
  });

  test('8. a row with no area, folder or project needs a look and cannot be imported; every task has its project’s area and folder', () => {
    const rows = [
      { Area: '', Folder: 'Admin', Project: 'Budget', Task: 'No area' },
      { Area: 'Work', Folder: '', Project: 'Budget', Task: 'No folder' },
      { Area: 'Work', Folder: 'Admin', Project: '', Task: 'No project' },
      { Area: 'Work', Folder: 'Admin', Project: 'Budget', Task: 'Fine' },
      { Area: 'Home', Folder: 'Garden', Project: 'Beds', Task: 'New' },
    ];
    const tasks = planTaskList(rows, existing, options({ ticked: { 0: true, 1: true, 2: true } }));
    assert.deepEqual(tasks.tasks.slice(0, 3).map((t) => t.include), [false, false, false]);
    assert.ok(tasks.tasks.slice(0, 3).every((t) => t.problems.length === 1));
    const plan = makePlan(rows, { ticked: { 0: true, 1: true, 2: true } });
    assert.equal(plan.items.length, 2);
    for (const item of plan.items) {
      const d = item.data as { projectId: string; areaId: string; bucketId: string };
      assert.ok(d.projectId && d.areaId && d.bucketId);
      if (d.projectId === 'budget') assert.deepEqual([d.areaId, d.bucketId], ['work', 'admin']);
      else {
        const project = plan.places[d.projectId];
        assert.deepEqual([d.areaId, d.bucketId], [project.areaId, project.folderId]);
      }
    }
  });
});
