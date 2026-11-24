// The task import's log (owner, 24 Nov 2026): the source of truth for what
// an import wrote, so it can be stopped, picked up after a crash, and rolled
// back. Pure: it only builds write operations and reads stored data; the
// runner (importRunner.ts) and the hook (logic/importData/useTaskImport.ts)
// send them to Firestore.
//
// Layout, all under users/{uid}/settings (the only place the rules let the
// app write free-form documents):
//   import-{importId}            the log: file name, status, counts, the new
//                                places with their writes, and how many pages;
//   import-{importId}-items-{n}  the items, 400 to a page, so no document
//                                nears the 1 MB limit.
// An item keeps its task's document, so Resume needs nothing but the log.

export const PAGE_SIZE = 400;

export type LogStatus = 'running' | 'stopping' | 'stopped' | 'completed' | 'rolling_back' | 'rolled_back' | 'failed';
export type ItemStatus = 'waiting' | 'writing' | 'imported' | 'failed' | 'removed';
export type PlaceKind = 'area' | 'folder' | 'project';
export type PlaceStatus = 'waiting' | 'created' | 'removed' | 'kept';

/** One write, as a path and data, so it can be counted and tested without Firestore. */
export type WriteOp =
  | { type: 'set'; path: string; data: Record<string, unknown> }
  | { type: 'update'; path: string; data: Record<string, unknown> }
  | { type: 'delete'; path: string };

/** A new area, folder or project the import creates, with its own writes. */
export interface PlaceSpec {
  id: string;
  kind: PlaceKind;
  name: string;
  /** The area a folder or project sits in; the folder a project sits in. */
  areaId: string | null;
  folderId: string | null;
  /** A new area's default folder id (written with the area). */
  defaultFolderId?: string | null;
  ops: WriteOp[];
}

export interface PlanItem {
  id: string;
  /** Position in the plan (file order of the ticked rows). */
  order: number;
  label: string;
  /** "Work / Admin / Website" */
  where: string;
  sourceRow: number;
  projectId: string;
  /** The new places this task needs, outermost first. */
  needs: string[];
  /** The new places planned to be written with this task (the first task that needs each). */
  creates: string[];
  /** The task's document. */
  data: Record<string, unknown>;
  status: ItemStatus;
  error: string | null;
  /** The places actually written with it (set when it is imported). */
  created: string[];
}

export interface PlanCounts {
  tasks: number;
  newAreas: number;
  newFolders: number;
  newProjects: number;
  /** Every write the runner performs on a run with no failures. */
  writes: number;
  chunks: number;
  /** The parts of `writes`, for the report. */
  parts: { tasks: number; places: number; log: number };
}

export interface ImportPlan {
  uid: string;
  importId: string;
  fileName: string;
  items: PlanItem[];
  places: Record<string, PlaceSpec & { status: PlaceStatus }>;
  counts: PlanCounts;
  /** A 23 Nov 2026 log: no pages to mark, nothing to resume. */
  legacy?: boolean;
}

export const logPath = (uid: string, importId: string) => `users/${uid}/settings/import-${importId}`;
export const pagePath = (uid: string, importId: string, page: number) => `users/${uid}/settings/import-${importId}-items-${page}`;
export const pageOf = (order: number) => Math.floor(order / PAGE_SIZE);
export const pageCount = (items: number) => Math.max(1, Math.ceil(items / PAGE_SIZE));

function storedItem(i: PlanItem) {
  return {
    order: i.order,
    label: i.label,
    where: i.where,
    sourceRow: i.sourceRow,
    projectId: i.projectId,
    needs: i.needs,
    creates: i.creates,
    data: i.data,
    status: i.status,
    error: i.error,
    created: i.created,
  };
}

/** The log and its pages, written before the first task. */
export function logCreateOps(plan: ImportPlan, startedAt: unknown): WriteOp[] {
  const pages = pageCount(plan.items.length);
  const main: WriteOp = {
    type: 'set',
    path: logPath(plan.uid, plan.importId),
    data: {
      kind: 'taskImport',
      importId: plan.importId,
      fileName: plan.fileName,
      startedAt,
      at: startedAt,
      status: 'running' satisfies LogStatus,
      counts: plan.counts,
      pages,
      places: Object.fromEntries(Object.values(plan.places).map((p) => [p.id, { kind: p.kind, name: p.name, areaId: p.areaId, folderId: p.folderId, defaultFolderId: p.defaultFolderId ?? null, ops: p.ops, status: p.status }])),
      undoneAt: null,
    },
  };
  const pageOps: WriteOp[] = [];
  for (let n = 0; n < pages; n++) {
    const items = plan.items.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE);
    pageOps.push({ type: 'set', path: pagePath(plan.uid, plan.importId, n), data: { kind: 'taskImportItems', importId: plan.importId, page: n, items: Object.fromEntries(items.map((i) => [i.id, storedItem(i)])) } });
  }
  return [main, ...pageOps];
}

/** Item changes, one update per page touched. */
export function itemOps(plan: ImportPlan, changes: { item: PlanItem; status: ItemStatus; error?: string | null; created?: string[] }[]): WriteOp[] {
  const byPage = new Map<number, Record<string, unknown>>();
  for (const c of changes) {
    const n = pageOf(c.item.order);
    const data = byPage.get(n) ?? {};
    data[`items.${c.item.id}.status`] = c.status;
    data[`items.${c.item.id}.error`] = c.error ?? null;
    if (c.created) data[`items.${c.item.id}.created`] = c.created;
    byPage.set(n, data);
  }
  return [...byPage].sort((a, b) => a[0] - b[0]).map(([n, data]) => ({ type: 'update', path: pagePath(plan.uid, plan.importId, n), data }));
}

/** The log's status, and anything else on the log itself. */
export function statusOp(plan: ImportPlan, status: LogStatus, extra: Record<string, unknown> = {}): WriteOp {
  return { type: 'update', path: logPath(plan.uid, plan.importId), data: { status, ...extra } };
}

/** Place statuses after a roll back. */
export function placeStatusData(places: { id: string; status: PlaceStatus }[]): Record<string, unknown> {
  return Object.fromEntries(places.map((p) => [`places.${p.id}.status`, p.status]));
}

// ---- Reading a stored log back ----

export interface StoredLog {
  kind?: string;
  importId?: string;
  fileName?: string | null;
  status?: LogStatus;
  counts?: PlanCounts;
  pages?: number;
  places?: Record<string, { kind: PlaceKind; name: string; areaId: string | null; folderId: string | null; defaultFolderId?: string | null; ops: WriteOp[]; status: PlaceStatus }>;
  undoneAt?: unknown;
  at?: unknown;
  /** The 23 Nov 2026 log, before items: what it created, by kind. */
  created?: { areas: string[]; folders?: string[]; projects: string[]; tasks: string[] };
  projects?: { id: string; name: string; count: number }[];
  summary?: string;
}

export interface StoredPage {
  items?: Record<string, ReturnType<typeof storedItem>>;
}

/** A stored log and its pages back to a plan the runner can resume or roll back. */
export function planFromLog(uid: string, importId: string, log: StoredLog, pages: StoredPage[]): ImportPlan {
  if (log.created && !log.places) return planFromOldLog(uid, importId, log);
  const items: PlanItem[] = pages
    .flatMap((p) => Object.entries(p.items ?? {}).map(([id, i]) => ({ ...i, id, created: i.created ?? [], error: i.error ?? null })))
    .sort((a, b) => a.order - b.order);
  const places = Object.fromEntries(
    Object.entries(log.places ?? {}).map(([id, p]) => [id, { id, kind: p.kind, name: p.name, areaId: p.areaId, folderId: p.folderId, defaultFolderId: p.defaultFolderId ?? null, ops: p.ops ?? [], status: p.status ?? 'waiting' }])
  );
  // A place is created once an item that wrote it is in.
  for (const i of items) if (i.status === 'imported') for (const id of i.created) if (places[id] && places[id].status === 'waiting') places[id].status = 'created';
  const counts = log.counts ?? emptyCounts(items.length);
  return { uid, importId, fileName: log.fileName ?? 'spreadsheet', items, places, counts };
}

function emptyCounts(tasks: number): PlanCounts {
  return { tasks, newAreas: 0, newFolders: 0, newProjects: 0, writes: 0, chunks: 0, parts: { tasks: 0, places: 0, log: 0 } };
}

/** The 23 Nov log: every task imported, every place created, no stored documents. */
function planFromOldLog(uid: string, importId: string, log: StoredLog): ImportPlan {
  const c = log.created!;
  const items: PlanItem[] = c.tasks.map((id, order) => ({ id, order, label: 'Task', where: '', sourceRow: 0, projectId: '', needs: [], creates: [], data: {}, status: 'imported', error: null, created: [] }));
  const place =
    (kind: PlaceKind) =>
    (id: string): [string, PlaceSpec & { status: PlaceStatus }] => [id, { id, kind, name: kind, areaId: null, folderId: null, defaultFolderId: kind === 'area' ? `default-${id}` : null, ops: [], status: 'created' }];
  const places = Object.fromEntries([...c.areas.map(place('area')), ...(c.folders ?? []).map(place('folder')), ...c.projects.map(place('project'))]);
  return { uid, importId, fileName: 'spreadsheet', items, places, counts: emptyCounts(items.length), legacy: true };
}
