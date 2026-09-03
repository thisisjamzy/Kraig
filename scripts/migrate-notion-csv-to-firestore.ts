/**
 * One-time migration: the CSV exports in "notion data/" (siblings of this
 * repo, not committed) -> Firestore, for one specific account.
 *
 * Unlike migrate-notion-to-firestore.ts (which queries the live Notion API
 * by data-source id), this reads flat CSV exports directly — no Notion
 * token needed, works from whatever the household last exported. Every
 * relation column in a Notion CSV export renders as "Name (https://...)" ;
 * this strips that suffix and joins by name, which is why duplicate names
 * across two different Notion pages (see "categories: name collisions"
 * below) need a human's eyes, not a guess.
 *
 * Deliberately adapts the source data to this app's actual schema rather
 * than the reverse:
 *   - A category whose Notion "Transaction Type" is "Transfer" has no
 *     equivalent in this app's 3-value Category.transactionType enum
 *     (Expense/Income/Savings) — categories transfer money conceptually via
 *     the separate transfers collection, not a category — so these rows are
 *     skipped entirely, not force-mapped.
 *   - Notion represented a recurring bill as one Budget Line Item page per
 *     occurrence (e.g. 8 separate "Njangi - <person> - <date>" rows, same
 *     category/account/amount, Type=Recurring). This app models a recurring
 *     budget as ONE rule with frequency:'Monthly'. Rows are grouped by
 *     (category, account, amount) when Type=Recurring and collapsed into a
 *     single rule anchored at the earliest date in the group — this is
 *     exactly the "adapt to what we have, not vice versa" case named in the
 *     request, not a heuristic guess: Notion's own data shape *is* one
 *     recurring bill split into monthly pages.
 *   - Transfers (its own Notion database, "Transfers ...csv") move a
 *     balance between two of this app's own accounts — no category, no
 *     transaction. `kind` (Wallet to wallet / Wallet to savings / Savings to
 *     wallet, viewmodels/categories.ts's TRANSFER_KINDS) is inferred from
 *     the two accounts' own `type`, same heuristic
 *     migrate-notion-to-firestore.ts already uses for its API-sourced
 *     transfers. Notion's Transfers database has no Date property, only
 *     Created time — used as the transfer date.
 *   - Projects (its own Notion database) map onto FirestoreProject directly;
 *     Notion's "Areas" relation on a project maps onto FirestoreArea
 *     (created if it doesn't already exist here — "Work"/"Personal" already
 *     did). Notion's "Department" property has no FirestoreProject
 *     equivalent, so it's folded into the description as a prefix
 *     ("Department — description") rather than dropped. "Progress"/"Task
 *     Remaining" aren't stored fields in this app (this app derives project
 *     progress from its tasks' own `done` state at render time, not a
 *     stored number) — not migrated, no data lost, just not duplicated.
 *     Every task a Notion project lists under its own "Tasks" relation gets
 *     that project's id (and its area's id, mirroring FirestoreTask's own
 *     areaId convention) written onto the matching already-migrated task,
 *     matched by title — this is a real UPDATE to tasks migrated by an
 *     earlier run of this same script, not just a create.
 *   - The root-level "projects.csv" (lowercase, distinct from the "Projects
 *     ...csv" export above) is NOT a PARA Projects export — it's two rows
 *     shaped like a generic transaction log (Date/Type/Account/Category/
 *     Amount/Description) that don't correspond to anything in this app's
 *     schema. Left alone.
 *
 * Cross-checked against whatever already lives in this account's Firestore
 * before planning anything (this account was not empty — it already had
 * hand-entered accounts, categories, transactions, tasks, budget rules,
 * areas and projects from testing the app). Two different confidence
 * tiers, see "existing-data matching" below:
 *   - An EXACT match (same name, punctuation/case/spacing ignored — plus
 *     same transactionType for categories) is treated as the same
 *     real-world thing and is never re-created; every reference to it
 *     (a transaction's accountId, a budget rule's categoryId, a project's
 *     areaId, ...) resolves to the EXISTING doc's id, not a new one.
 *   - A near match (e.g. CSV "Orange Money" vs existing "Orange", CSV
 *     "Rents" vs existing "Rent") is only ever a warning, never
 *     auto-merged — two names can look alike and still be genuinely
 *     different accounts/categories, and guessing wrong here corrupts real
 *     financial data. Resolve these by hand afterward, e.g. in the now
 *     editable Categories list (src/screens/CategoryEdit) or a wallet's own
 *     edit screen.
 *
 * Setup:
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   (already in app/.env.local, loaded automatically by scripts/lib/adminApp.ts)
 *   TARGET_EMAIL=james.berinyuy@aims-cameroon.org
 *   DRY_RUN=true npx tsx scripts/migrate-notion-csv-to-firestore.ts   # prints the plan, writes nothing
 *   DRY_RUN=false npx tsx scripts/migrate-notion-csv-to-firestore.ts  # writes for real
 *
 * Safe to re-run: every doc id is deterministic (a short hash of the row's
 * own natural key — Notion's CSV export has no stable page id column at
 * all, unlike the API) AND every planned item is checked against what's
 * already there by name/description before being written, so re-running
 * overwrites the same migrated rows instead of duplicating them, and so
 * does re-running after manually entering some of the same data in the app.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { db, Timestamp, requireTargetUid } from './lib/adminApp';
import type { Timestamp as TimestampType } from 'firebase-admin/firestore';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const DATA_DIR = join(__dirname, '..', 'notion data');

type Row = Record<string, string>;

function readCsv(filename: string): Row[] {
  const raw = readFileSync(join(DATA_DIR, filename), 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Row[];
}

/** "Leader Bag (https://app.notion.com/p/...)" -> "Leader Bag". A cell with
 * more than one comma-separated relation is not expected in any single-value
 * column this script reads this way (verified against the real export);
 * only the first is used if it ever happens, with a warning. Multi-value
 * relation columns (Projects.Tasks) use relationNames() below instead. */
function relationName(raw: string | undefined, label: string, rowContext: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/,\s*(?=[A-Za-z])/).filter(Boolean);
  if (parts.length > 1) {
    console.warn(`[warn] ${label} on "${rowContext}" has ${parts.length} values, using the first: ${parts[0]}`);
  }
  const match = parts[0].match(/^(.*?)\s*\(https:\/\/[^)]*\)\s*$/);
  return (match ? match[1] : parts[0]).trim();
}

/** Same "strip the (https://...) suffix" idea as relationName(), but for a
 * column that's genuinely meant to hold several relations at once (Projects'
 * own "Tasks" column: every task that project lists). */
function relationNames(raw: string | undefined): string[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];
  return trimmed
    .split(/,\s*(?=[A-Za-z])/)
    .map((part) => {
      const match = part.match(/^(.*?)\s*\(https:\/\/[^)]*\)\s*$/);
      return (match ? match[1] : part).trim();
    })
    .filter(Boolean);
}

/** Notion date cells look like "July 10, 2026", "August 26, 2026 2:30 PM
 * (GMT+1)", or "July 11, 2026 3:15 AM" — strips any trailing "(...)" (a
 * timezone note Date can't parse) before handing the rest to the built-in
 * parser, which already handles a bare time-of-day suffix on its own. */
function parseNotionDate(raw: string | undefined): Date | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/\s*\([^)]*\)\s*$/, '');
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A Notion date-range property renders as "July 20, 2026 → February 26,
 * 2027" (U+2192 arrow) in a CSV export, or a single date with no arrow at
 * all when nothing was entered for the end of the range. A single date is
 * treated as an end/target date (startDate null) — every real example in
 * this export ("RoadHome" → a single far-future date) reads as a deadline,
 * not a start. */
function parseNotionDateRange(raw: string | undefined): { start: Date | null; end: Date | null } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { start: null, end: null };
  const [startRaw, endRaw] = trimmed.split('→').map((s) => s.trim());
  if (endRaw) return { start: parseNotionDate(startRaw), end: parseNotionDate(endRaw) };
  return { start: null, end: parseNotionDate(startRaw) };
}

/** Deterministic short id from a row's natural key, since the CSV export
 * (unlike the Notion API) has no stable page id column to key off. */
function hashId(prefix: string, ...parts: string[]): string {
  const hash = createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
}

function slugFor(name: string, prefix: string, seen: Set<string>): string {
  const base = prefix + '_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  let candidate = base || `${prefix}_unnamed`;
  let n = 2;
  while (seen.has(candidate)) candidate = `${base}_${n++}`;
  seen.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------
// existing-data matching — see header comment
// ---------------------------------------------------------------------------

/** Strips everything but letters/digits and lowercases — "Leader Bag" and
 * "Leaderbag" collapse to the same key on purpose (account/category names
 * are short human-chosen labels, punctuation/spacing drift between two
 * people's typing of the same name is common and low-risk to fold
 * together); transaction descriptions use this too but combined with
 * amount+date, so it can't accidentally merge two unrelated $0 items. */
function looseKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dayKey(ts: TimestampType | null | undefined): string {
  return ts ? ts.toDate().toISOString().slice(0, 10) : '';
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  return dp[b.length];
}

/** Loose keys that are NOT identical (an identical loose key is an exact
 * match, handled separately) but close enough to be worth a human's
 * attention — one contains the other, or they're within edit-distance 2. */
function isNearMiss(a: string, b: string): boolean {
  if (a === b || !a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  return levenshtein(a, b) <= 2;
}

interface ExistingAccount {
  id: string;
  name: string;
  type: string;
}
interface ExistingCategory {
  id: string;
  name: string;
  transactionType: string;
}
interface ExistingNamed {
  id: string;
  name: string;
}
interface ExistingTask {
  id: string;
  title: string;
}
interface Existing {
  accounts: ExistingAccount[];
  categories: ExistingCategory[];
  areas: ExistingNamed[];
  projects: ExistingNamed[];
  tasks: ExistingTask[];
  taskKeys: Set<string>;
  transactionKeys: Set<string>;
  budgetRuleKeys: Set<string>;
  transferKeys: Set<string>;
}

async function loadExisting(uid: string): Promise<Existing> {
  const userDoc = db.collection('users').doc(uid);
  const [accountsSnap, categoriesSnap, areasSnap, projectsSnap, tasksSnap, txSnap, rulesSnap, transfersSnap] = await Promise.all([
    userDoc.collection('accounts').get(),
    userDoc.collection('categories').get(),
    userDoc.collection('areas').get(),
    userDoc.collection('projects').get(),
    userDoc.collection('tasks').get(),
    userDoc.collection('transactions').get(),
    userDoc.collection('budgetRules').get(),
    userDoc.collection('transfers').get(),
  ]);
  return {
    accounts: accountsSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? ''), type: String(d.data().type ?? '') })),
    categories: categoriesSnap.docs.map((d) => ({
      id: d.id,
      name: String(d.data().name ?? ''),
      transactionType: String(d.data().transactionType ?? ''),
    })),
    areas: areasSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') })),
    projects: projectsSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') })),
    tasks: tasksSnap.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? '') })),
    taskKeys: new Set(tasksSnap.docs.map((d) => `${looseKey(String(d.data().title ?? ''))}::${dayKey(d.data().dueDate)}`)),
    transactionKeys: new Set(
      txSnap.docs.map((d) => `${looseKey(String(d.data().description ?? ''))}::${d.data().amount}::${dayKey(d.data().date)}`)
    ),
    budgetRuleKeys: new Set(
      rulesSnap.docs.map((d) => `${looseKey(String(d.data().description ?? ''))}::${d.data().budgetedAmount}`)
    ),
    transferKeys: new Set(
      transfersSnap.docs.map(
        (d) => `${d.data().fromAccountId}::${d.data().toAccountId}::${d.data().amount}::${dayKey(d.data().date)}`
      )
    ),
  };
}

const nowTs = Timestamp.now();

// Near-misses the automatic loose-name match couldn't resolve on its own
// (see isNearMiss), confirmed by James on 2026-09-03 as the same real-world
// account/category, just named differently between Notion and the app.
// Mapped to the exact existing name so they resolve as an exact match
// (reuse the existing doc, no near-miss warning) instead of creating a
// second one.
const ACCOUNT_ALIASES: Record<string, string> = { 'Orange Money': 'Orange' };
const CATEGORY_ALIASES: Record<string, string> = { Rents: 'Rent' };

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

interface PlannedAccount {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

function planAccounts(existing: Existing): {
  planned: PlannedAccount[];
  accountIdByName: Map<string, string>;
  accountTypeById: Map<string, string>;
} {
  const rows = readCsv('Accounts 3917e487e9d480ec884ffa012f03ec94_all.csv');
  const seen = new Set<string>();
  const planned: PlannedAccount[] = [];
  const accountIdByName = new Map<string, string>();
  const accountTypeById = new Map<string, string>(existing.accounts.map((a) => [a.id, a.type]));
  const existingByLoose = new Map(existing.accounts.map((a) => [looseKey(a.name), a]));

  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) continue;
    const loose = looseKey(ACCOUNT_ALIASES[name] ?? name);
    const existingMatch = existingByLoose.get(loose);
    if (existingMatch) {
      console.log(`accounts: "${name}" already exists as "${existingMatch.name}" (${existingMatch.id}) — reusing it, not creating a duplicate`);
      accountIdByName.set(name, existingMatch.id);
      continue;
    }
    for (const other of existing.accounts) {
      if (isNearMiss(loose, looseKey(other.name))) {
        console.warn(`[warn] account "${name}" looks similar to existing "${other.name}" (${other.id}) but doesn't match exactly — creating it as a new account, verify by hand this isn't the same wallet`);
      }
    }
    const id = slugFor(name, 'acc', seen);
    const type = row.Type?.trim() || 'Cash';
    const startingBalance = Number(row['Starting Balance (XAF)']) || 0;
    accountIdByName.set(name, id);
    accountTypeById.set(id, type);
    planned.push({
      id,
      name,
      data: {
        name,
        type,
        currency: 'XAF', // Notion never modeled per-account currency — see header
        startingBalance,
        currentBalance: startingBalance, // corrected in the balance recompute pass
        notes: row.Notes?.trim() ?? '',
        archived: false,
        notSpendable: false,
        frozen: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }
  return { planned, accountIdByName, accountTypeById };
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

interface PlannedCategory {
  id: string;
  name: string;
  transactionType: 'Expense' | 'Income' | 'Savings';
  data: Record<string, unknown>;
}

const VALID_TX_TYPES = new Set(['Expense', 'Income', 'Savings']);

function planCategories(existing: Existing): {
  planned: PlannedCategory[];
  skippedTransferCount: number;
  categoryIndex: Map<string, { id: string; transactionType: string }[]>;
} {
  const rows = readCsv('Categories 3917e487e9d480329c26c5b7e6eb601b.csv');
  const seen = new Set<string>();
  const planned: PlannedCategory[] = [];
  let skippedTransferCount = 0;
  const warnedNames = new Set<string>();

  // Existing-only index — decides reuse-vs-create below. Deliberately kept
  // separate from categoryIndex (which also collects newly planned rows):
  // if a *planned* row were allowed to satisfy a later row's "does this
  // already exist" check, two genuinely-distinct Notion pages that happen
  // to share a name (e.g. the two "Rents" rows below, different Group
  // values) would silently collapse into one and quietly drop data instead
  // of getting flagged for a human to look at.
  const existingIndex = new Map<string, ExistingCategory[]>();
  for (const cat of existing.categories) {
    const key = looseKey(cat.name);
    const list = existingIndex.get(key) ?? [];
    list.push(cat);
    existingIndex.set(key, list);
  }

  // Seeded with every existing category (by loose name) so the
  // transaction/budget-rule resolver built on this afterward prefers an
  // already-real doc id over a newly minted one for the same name; grows to
  // include every newly planned category too, WITH duplicates preserved
  // (two Notion pages named "Rents" become two separate candidates here,
  // same as the original Notion-API-based script's behavior).
  const categoryIndex = new Map<string, { id: string; transactionType: string }[]>();
  for (const cat of existing.categories) {
    const key = looseKey(cat.name);
    const list = categoryIndex.get(key) ?? [];
    list.push({ id: cat.id, transactionType: cat.transactionType });
    categoryIndex.set(key, list);
  }

  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) continue;
    const txType = row['Transaction Type']?.trim();
    if (!txType || !VALID_TX_TYPES.has(txType)) {
      // "Transfer" categories (e.g. "SGC to Leader Bag") have no equivalent
      // in this app's model — see header comment — skipped, not guessed.
      skippedTransferCount++;
      continue;
    }
    const loose = looseKey(CATEGORY_ALIASES[name] ?? name);
    const existingSameType = (existingIndex.get(loose) ?? []).find((c) => c.transactionType === txType);
    if (existingSameType) {
      console.log(`categories: "${name}" (${txType}) already exists (${existingSameType.id}) — reusing it, not creating a duplicate`);
      // Register under the CSV's own spelling too (e.g. "rents", not just
      // aliased-to "rent") — a Transaction/Budget Line Item row referencing
      // this category by its Notion name needs resolveCategory() to find it
      // via categoryIndex, which is keyed by loose name, not the alias map.
      const rawLoose = looseKey(name);
      if (rawLoose !== loose) {
        const list = categoryIndex.get(rawLoose) ?? [];
        if (!list.some((c) => c.id === existingSameType.id)) list.push(existingSameType);
        categoryIndex.set(rawLoose, list);
      }
      continue;
    }
    if (!warnedNames.has(loose)) {
      warnedNames.add(loose);
      for (const other of existing.categories) {
        if (isNearMiss(loose, looseKey(other.name))) {
          console.warn(`[warn] category "${name}" looks similar to existing "${other.name}" (${other.transactionType}, ${other.id}) but doesn't match exactly — creating it as a new category, verify by hand this isn't the same one`);
        }
      }
    }
    const id = slugFor(name, 'cat', seen);
    const list = categoryIndex.get(loose) ?? [];
    list.push({ id, transactionType: txType });
    categoryIndex.set(loose, list);
    planned.push({
      id,
      name,
      transactionType: txType as 'Expense' | 'Income' | 'Savings',
      data: {
        name,
        transactionType: txType,
        group: row.Group?.trim() || null,
        notes: row.Notes?.trim() ?? '',
        archived: false,
      },
    });
  }

  const plannedByName = new Map<string, PlannedCategory[]>();
  for (const cat of planned) {
    const list = plannedByName.get(cat.name) ?? [];
    list.push(cat);
    plannedByName.set(cat.name, list);
  }
  const collisions = [...plannedByName.entries()].filter(([, list]) => list.length > 1);
  if (collisions.length > 0) {
    console.warn(`\n[warn] ${collisions.length} category name(s) exist more than once in the CSV (different Notion pages, same name), and neither matched an existing category.`);
    console.warn('        Both are created as separate categories. Rows referencing them are matched by transaction/budget type where possible,');
    console.warn('        otherwise the first one found — review these by hand afterward:');
    for (const [name, list] of collisions) {
      console.warn(`        "${name}": ${list.map((c) => `${c.id} (${c.transactionType})`).join(', ')}`);
    }
    console.warn('');
  }

  return { planned, skippedTransferCount, categoryIndex };
}

/** name (+ optional preferred transactionType, for the "same name, two
 * different types" rows) -> Firestore doc id. Backed by categoryIndex,
 * which already prefers an existing doc's id over a newly planned one. */
function buildCategoryResolver(categoryIndex: Map<string, { id: string; transactionType: string }[]>) {
  return function resolve(name: string | null, preferredType?: string): string | undefined {
    if (!name) return undefined;
    const candidates = categoryIndex.get(looseKey(name));
    if (!candidates || candidates.length === 0) return undefined;
    if (preferredType) {
      const exact = candidates.find((c) => c.transactionType === preferredType);
      if (exact) return exact.id;
    }
    return candidates[0].id;
  };
}

// ---------------------------------------------------------------------------
// areas — derived from the unique names in Projects' own "Areas" column,
// since no dedicated Areas CSV was exported.
// ---------------------------------------------------------------------------

interface PlannedArea {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

// Same PROJECT_COLORS swatch list as src/viewmodels/projects.ts (not
// imported directly — this script runs standalone under tsx, outside the
// Next.js app's module graph — kept in sync by hand, it's an 8-entry
// constant that rarely changes).
const PROJECT_COLORS = ['#7b7ef3', '#f88686', '#ff9800', '#3a81f8', '#0097a7', '#fac021', '#8bc34a', '#e91e63'];

function planAreas(existing: Existing, areaNames: string[]): { planned: PlannedArea[]; areaIdByName: Map<string, string> } {
  const seen = new Set<string>();
  const planned: PlannedArea[] = [];
  const areaIdByName = new Map<string, string>();
  const existingByLoose = new Map(existing.areas.map((a) => [looseKey(a.name), a]));
  let colorIndex = 0;

  for (const name of areaNames) {
    if (areaIdByName.has(name)) continue;
    const loose = looseKey(name);
    const existingMatch = existingByLoose.get(loose);
    if (existingMatch) {
      console.log(`areas: "${name}" already exists as "${existingMatch.name}" (${existingMatch.id}) — reusing it, not creating a duplicate`);
      areaIdByName.set(name, existingMatch.id);
      continue;
    }
    const id = slugFor(name, 'area', seen);
    areaIdByName.set(name, id);
    planned.push({
      id,
      name,
      data: {
        name,
        emoji: null,
        color: PROJECT_COLORS[colorIndex++ % PROJECT_COLORS.length],
        description: '', // no Notion data source for this — see header
        archived: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }
  return { planned, areaIdByName };
}

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

interface PlannedProject {
  id: string;
  name: string;
  areaId: string | null;
  data: Record<string, unknown> | null; // null when reusing an existing project
  taskNames: string[]; // every task this project's own "Tasks" column lists, for the task-linking pass below
}

function planProjects(
  existing: Existing,
  areaIdByName: Map<string, string>
): { planned: PlannedProject[]; allProjectRows: PlannedProject[] } {
  const rows = readCsv('Projects 4227e487e9d48209b7e081bea58892bb_all.csv');
  const seen = new Set<string>();
  const planned: PlannedProject[] = [];
  const allProjectRows: PlannedProject[] = [];
  const existingByLoose = new Map(existing.projects.map((p) => [looseKey(p.name), p]));

  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) continue;
    const areaName = relationName(row.Areas, 'Projects.Areas', name);
    const areaId = areaName ? (areaIdByName.get(areaName) ?? null) : null;
    const taskNames = relationNames(row['Tasks  ']);
    const loose = looseKey(name);
    const existingMatch = existingByLoose.get(loose);

    if (existingMatch) {
      console.log(`projects: "${name}" already exists (${existingMatch.id}) — reusing it, not creating a duplicate`);
      const project: PlannedProject = { id: existingMatch.id, name, areaId, data: null, taskNames };
      allProjectRows.push(project);
      continue;
    }
    for (const other of existing.projects) {
      if (isNearMiss(loose, looseKey(other.name))) {
        console.warn(`[warn] project "${name}" looks similar to existing "${other.name}" (${other.id}) but doesn't match exactly — creating it as a new project, verify by hand this isn't the same one`);
      }
    }

    const id = hashId('proj', name);
    const statusRaw = row.Status?.trim().toLowerCase() ?? '';
    const status = statusRaw.includes('archiv') ? 'Archived' : statusRaw.includes('complet') || statusRaw.includes('done') ? 'Completed' : 'Active';
    const { start, end } = parseNotionDateRange(row['Start / End Date ']);
    const department = row.Department?.trim();
    const description = row.Description?.trim() ?? '';
    const project: PlannedProject = {
      id,
      name,
      areaId,
      taskNames,
      data: {
        name,
        emoji: null,
        areaId,
        color: PROJECT_COLORS[planned.length % PROJECT_COLORS.length],
        priority: 'Medium', // no Notion column for this — see header
        startDate: start ? Timestamp.fromDate(start) : null,
        endDate: end ? Timestamp.fromDate(end) : null,
        originalEndDate: end ? Timestamp.fromDate(end) : null,
        rescheduleCount: 0,
        status,
        // Notion's "Department" property has no FirestoreProject field —
        // folded into the description as a prefix rather than dropped.
        description: department ? `${department} — ${description}` : description,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    };
    planned.push(project);
    allProjectRows.push(project);
  }
  console.log(`projects: planned ${planned.length} new of ${rows.length}`);
  return { planned, allProjectRows };
}

// ---------------------------------------------------------------------------
// task <-> project linking — a real UPDATE to tasks this same script already
// migrated (or is migrating right now), matched by title against every name
// each Notion project's own "Tasks" relation lists.
// ---------------------------------------------------------------------------

function linkTasksToProjects(
  existing: Existing,
  newTasks: { id: string; data: Record<string, unknown> }[],
  projectRows: PlannedProject[]
): Map<string, { projectId: string; areaId: string | null }> {
  const titleIndex = new Map<string, { id: string }[]>();
  for (const t of existing.tasks) {
    const list = titleIndex.get(looseKey(t.title)) ?? [];
    list.push({ id: t.id });
    titleIndex.set(looseKey(t.title), list);
  }
  for (const t of newTasks) {
    const title = String(t.data.title ?? '');
    const list = titleIndex.get(looseKey(title)) ?? [];
    list.push({ id: t.id });
    titleIndex.set(looseKey(title), list);
  }

  const links = new Map<string, { projectId: string; areaId: string | null }>();
  let linked = 0;
  let unmatched = 0;
  for (const project of projectRows) {
    for (const taskName of project.taskNames) {
      const candidates = titleIndex.get(looseKey(taskName));
      if (!candidates || candidates.length === 0) {
        console.warn(`[skip] task "${taskName}" referenced by project "${project.name}" wasn't found among migrated/existing tasks, link it by hand`);
        unmatched++;
        continue;
      }
      if (candidates.length > 1) {
        console.warn(`[warn] task "${taskName}" matches ${candidates.length} tasks by title — linking the first one to project "${project.name}", verify by hand`);
      }
      links.set(candidates[0].id, { projectId: project.id, areaId: project.areaId });
      linked++;
    }
  }
  console.log(`tasks: linked ${linked} to a project (${unmatched} referenced by a project but not found)`);
  return links;
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

const VALID_PRIORITIES = new Set(['High', 'Medium', 'Low']);

function planTasks(existing: Existing): { id: string; data: Record<string, unknown> }[] {
  const rows = readCsv('Tasks 8a07e487e9d4836f9fcd81ab1222087f.csv');
  const planned: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) continue;
    const due = parseNotionDate(row['Due Date ']);
    const dueTs = due ? Timestamp.fromDate(due) : null;
    const key = `${looseKey(name)}::${dayKey(dueTs)}`;
    if (existing.taskKeys.has(key)) {
      console.log(`tasks: "${name}" already exists — reusing it, not creating a duplicate`);
      skipped++;
      continue;
    }
    const status = row['Status']?.trim().toLowerCase();
    const done = status === 'done' || status === 'completed';
    const priorityRaw = row['Priority ']?.trim();
    const priority = VALID_PRIORITIES.has(priorityRaw) ? priorityRaw : 'Medium';
    const id = hashId('task', name, row['Due Date '] ?? '');
    planned.push({
      id,
      data: {
        title: name,
        emoji: null,
        type: 'ToDo',
        priority,
        projectId: null, // filled in by linkTasksToProjects() below, if referenced by a project
        areaId: null,
        parentTaskId: null,
        done,
        dueDate: dueTs,
        originalDueDate: dueTs,
        rescheduleCount: 0,
        completedAt: done ? nowTs : null,
        calendarEventId: null,
        dependsOnTaskId: null,
        estimatedCost: null,
        linkedTransactionId: null,
        notes: '',
        tags: [],
        archived: false,
        createdBy: '', // filled in with the real uid right before writing
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }
  console.log(`tasks: planned ${planned.length} of ${rows.length} (${skipped} already existed)`);
  return planned;
}

// ---------------------------------------------------------------------------
// transfers
// ---------------------------------------------------------------------------

function planTransfers(existing: Existing, accountIdByName: Map<string, string>, accountTypeById: Map<string, string>) {
  const rows = readCsv('Transfers 3937e487e9d480cfb67ad521810949c5_all.csv');
  const planned: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  let duplicates = 0;
  for (const row of rows) {
    const label = row.Name?.trim() || 'Transfer';
    const fromName = relationName(row.From, 'Transfers.From', label);
    const toName = relationName(row['Cash In'], 'Transfers.Cash In', label);
    const fromAccountId = fromName ? accountIdByName.get(fromName) : undefined;
    const toAccountId = toName ? accountIdByName.get(toName) : undefined;
    const created = parseNotionDate(row['Created time']);
    if (!fromAccountId || !toAccountId || !created) {
      console.warn(`[skip] transfer "${label}" is missing a resolved From/To account or a parseable date, migrate it by hand`);
      skipped++;
      continue;
    }
    const amount = Number(row.Amount) || 0;
    const dateTs = Timestamp.fromDate(created);
    const key = `${fromAccountId}::${toAccountId}::${amount}::${dayKey(dateTs)}`;
    if (existing.transferKeys.has(key)) {
      console.log(`transfers: "${label}" (${fromName} -> ${toName}) already exists — reusing it, not creating a duplicate`);
      duplicates++;
      continue;
    }
    const fromType = accountTypeById.get(fromAccountId);
    const toType = accountTypeById.get(toAccountId);
    const kind =
      fromType === 'Savings Account' && toType !== 'Savings Account'
        ? 'Savings to wallet'
        : fromType !== 'Savings Account' && toType === 'Savings Account'
          ? 'Wallet to savings'
          : 'Wallet to wallet';
    planned.push({
      id: hashId('transfer', fromAccountId, toAccountId, String(amount), row['Created time'] ?? ''),
      data: {
        date: dateTs,
        description: label,
        fromAccountId,
        toAccountId,
        amount,
        kind,
        notes: row.Notes?.trim() ?? '',
        createdBy: '', // filled in right before writing
        createdAt: nowTs,
      },
    });
  }
  console.log(`transfers: planned ${planned.length} of ${rows.length} (${skipped} skipped, ${duplicates} already existed)`);
  return planned;
}

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------

function planTransactions(
  existing: Existing,
  accountIdByName: Map<string, string>,
  resolveCategory: (name: string | null, preferredType?: string) => string | undefined
) {
  const rows = readCsv('Transactions 3917e487e9d480dfbb9adf04e3a2cf1d_all.csv');
  const planned: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  let duplicates = 0;
  for (const row of rows) {
    const description = row.Description?.trim();
    if (!description) continue;
    const accountName = relationName(row.Accounts, 'Transactions.Accounts', description);
    const accountId = accountName ? accountIdByName.get(accountName) : undefined;
    const date = parseNotionDate(row.Date);
    const type = row.Type?.trim() === 'Income' ? 'Income' : row.Type?.trim() === 'Savings' ? 'Savings' : 'Expense';
    if (!accountId || !date) {
      console.warn(`[skip] transaction "${description}" is missing a resolved account or a parseable date, migrate it by hand`);
      skipped++;
      continue;
    }
    const amount = Number(row.Amount) || 0;
    const dateTs = Timestamp.fromDate(date);
    const key = `${looseKey(description)}::${amount}::${dayKey(dateTs)}`;
    if (existing.transactionKeys.has(key)) {
      console.log(`transactions: "${description}" on ${dayKey(dateTs)} already exists — reusing it, not creating a duplicate`);
      duplicates++;
      continue;
    }
    const categoryName = relationName(row.Categories, 'Transactions.Categories', description);
    const categoryId = resolveCategory(categoryName, type);
    const direction = row.Direction?.trim() === 'Inflow' ? 'Inflow' : 'Outflow';
    const signedAmount = direction === 'Inflow' ? amount : -amount;
    const id = hashId('tx', description, row.Date ?? '', row.Amount ?? '', accountName ?? '');
    planned.push({
      id,
      data: {
        date: dateTs,
        type,
        description,
        accountId,
        categoryId: categoryId ?? null,
        amount,
        direction,
        signedAmount,
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        createdBy: '', // filled in right before writing
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }
  console.log(`transactions: planned ${planned.length} of ${rows.length} (${skipped} skipped, ${duplicates} already existed)`);
  return planned;
}

// ---------------------------------------------------------------------------
// budget rules — consolidates Notion's one-page-per-occurrence recurring
// bills into one Monthly rule each, see header comment.
// ---------------------------------------------------------------------------

function planBudgetRules(
  existing: Existing,
  accountIdByName: Map<string, string>,
  resolveCategory: (name: string | null, preferredType?: string) => string | undefined
) {
  const rows = readCsv('Budget Line Items 3917e487e9d480ebbcafdfc74b94ed11_all.csv');
  const oneOff: { id: string; data: Record<string, unknown> }[] = [];
  const recurringGroups = new Map<
    string,
    { categoryId: string; accountId: string | undefined; amount: number; dates: Date[]; names: string[]; tag: string | null }
  >();
  let skipped = 0;
  let duplicates = 0;

  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) continue;
    if (row.Archive?.trim() === 'Yes') continue; // archived in Notion, not migrated
    const accountName = relationName(row.Accounts, 'BudgetLineItems.Accounts', name);
    const accountId = accountName ? accountIdByName.get(accountName) : undefined;
    const categoryName = relationName(row.Categories, 'BudgetLineItems.Categories', name);
    const group = row.Group?.trim() || undefined; // Income/Savings/Expense-ish, used as a type hint
    const categoryId = resolveCategory(categoryName, group);
    const amount = Number(row['Planned Amount']) || 0;
    const due = parseNotionDate(row['Due Date']);
    if (!categoryId || !due) {
      console.warn(`[skip] budget line item "${name}" is missing a resolved category or a parseable due date, migrate it by hand`);
      skipped++;
      continue;
    }
    if (row.Type?.trim() !== 'Recurring' && existing.budgetRuleKeys.has(`${looseKey(name)}::${amount}`)) {
      // Only checked for non-recurring rows here — a recurring row's final
      // shape (consolidated, possibly renamed to the earliest occurrence)
      // isn't known until every row in its group has been seen, so its
      // duplicate check happens after grouping, below.
      console.log(`budgetRules: "${name}" already exists — reusing it, not creating a duplicate`);
      duplicates++;
      continue;
    }
    const tag = row.Tag?.trim() || null;
    const notionType = row.Type?.trim();

    if (notionType === 'Recurring') {
      const key = `${categoryId}::${accountId ?? ''}::${amount}`;
      const entry = recurringGroups.get(key) ?? { categoryId, accountId, amount, dates: [], names: [], tag };
      entry.dates.push(due);
      entry.names.push(name);
      recurringGroups.set(key, entry);
      continue;
    }

    const anchor = Timestamp.fromDate(due);
    oneOff.push({
      id: hashId('rule', name, row['Due Date'] ?? '', String(amount)),
      data: {
        categoryId,
        description: name,
        budgetedAmount: amount,
        frequency: 'Once',
        interval: 1,
        anchorDate: anchor,
        endCondition: 'On Date',
        endOccurrences: null,
        endDate: anchor,
        accountId: accountId ?? null,
        tag,
        archived: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }

  const recurring: { id: string; data: Record<string, unknown> }[] = [];
  for (const [key, entry] of recurringGroups) {
    const earliest = entry.dates.reduce((min, d) => (d < min ? d : min));
    const label = entry.names[0];
    if (existing.budgetRuleKeys.has(`${looseKey(label)}::${entry.amount}`)) {
      console.log(`budgetRules: "${label}" (recurring, ${entry.names.length} Notion rows) already exists — reusing it, not creating a duplicate`);
      duplicates++;
      continue;
    }
    if (entry.names.length > 1) {
      console.log(`budgetRules: consolidated ${entry.names.length} Notion rows into one Monthly rule "${label}" (${entry.names.join(', ')})`);
    }
    recurring.push({
      id: hashId('rule', 'recurring', key),
      data: {
        categoryId: entry.categoryId,
        description: label,
        budgetedAmount: entry.amount,
        frequency: 'Monthly',
        interval: 1,
        anchorDate: Timestamp.fromDate(earliest),
        endCondition: 'Never',
        endOccurrences: null,
        endDate: null,
        accountId: entry.accountId ?? null,
        tag: entry.tag,
        archived: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    });
  }

  const planned = [...oneOff, ...recurring];
  console.log(
    `budgetRules: planned ${planned.length} (${oneOff.length} one-off, ${recurring.length} recurring after consolidation, ${skipped} skipped, ${duplicates} already existed)`
  );
  return planned;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written. Set DRY_RUN=false to write for real. ===\n' : '=== LIVE RUN ===\n');

  // Resolved and checked against in both modes — the whole point of a dry
  // run here is to preview what would be skipped as an existing duplicate,
  // not just what would be created.
  const uid = await requireTargetUid();
  const existing = await loadExisting(uid);
  console.log(
    `Existing Firestore data for uid ${uid}: ${existing.accounts.length} accounts, ${existing.categories.length} categories, ${existing.areas.length} areas, ${existing.projects.length} projects, ${existing.taskKeys.size} tasks, ${existing.transactionKeys.size} transactions, ${existing.budgetRuleKeys.size} budget rules, ${existing.transferKeys.size} transfers.\n`
  );

  const { planned: accounts, accountIdByName, accountTypeById } = planAccounts(existing);
  console.log(`accounts: planned ${accounts.length} new`);

  const { planned: categories, skippedTransferCount, categoryIndex } = planCategories(existing);
  console.log(`categories: planned ${categories.length} new (${skippedTransferCount} "Transfer"-typed categories skipped, see header comment)`);
  const resolveCategory = buildCategoryResolver(categoryIndex);

  const projectRowsRaw = readCsv('Projects 4227e487e9d48209b7e081bea58892bb_all.csv');
  const areaNames = [...new Set(projectRowsRaw.map((row) => relationName(row.Areas, 'Projects.Areas', row.Name ?? '')).filter((n): n is string => Boolean(n)))];
  const { planned: areas, areaIdByName } = planAreas(existing, areaNames);
  console.log(`areas: planned ${areas.length} new`);

  const { planned: projects, allProjectRows } = planProjects(existing, areaIdByName);

  const tasks = planTasks(existing);
  const taskLinks = linkTasksToProjects(existing, tasks, allProjectRows);
  for (const t of tasks) {
    const link = taskLinks.get(t.id);
    if (link) t.data = { ...t.data, projectId: link.projectId, areaId: link.areaId };
  }
  // Tasks already written by an earlier run of this script aren't in `tasks`
  // above (planTasks() only plans NEW ones) but can still be linked to a
  // project just discovered this run — those get a direct field update
  // instead of a full re-write, applied in the live-write phase below.
  const newTaskIds = new Set(tasks.map((t) => t.id));
  const existingTaskLinkUpdates = [...taskLinks.entries()].filter(([taskId]) => !newTaskIds.has(taskId));

  const transactions = planTransactions(existing, accountIdByName, resolveCategory);
  const transfers = planTransfers(existing, accountIdByName, accountTypeById);
  const budgetRules = planBudgetRules(existing, accountIdByName, resolveCategory);

  console.log(
    `\nTotals to write: ${accounts.length} accounts, ${categories.length} categories, ${areas.length} areas, ${projects.length} projects, ${tasks.length} tasks (${existingTaskLinkUpdates.length} existing tasks get a project link update), ${transactions.length} transactions, ${transfers.length} transfers, ${budgetRules.length} budget rules.`
  );

  if (DRY_RUN) {
    console.log('\nDry run complete — review the counts and every [warn] line above, then re-run with DRY_RUN=false to write.');
    return;
  }

  const userDoc = db.collection('users').doc(uid);
  console.log(`\nWriting into uid ${uid}...`);

  const bulkWriter = db.bulkWriter();
  for (const a of accounts) bulkWriter.set(userDoc.collection('accounts').doc(a.id), a.data);
  for (const c of categories) bulkWriter.set(userDoc.collection('categories').doc(c.id), c.data);
  for (const a of areas) bulkWriter.set(userDoc.collection('areas').doc(a.id), a.data);
  for (const p of projects) if (p.data) bulkWriter.set(userDoc.collection('projects').doc(p.id), p.data);
  for (const t of tasks) bulkWriter.set(userDoc.collection('tasks').doc(t.id), { ...t.data, createdBy: uid });
  for (const [taskId, link] of existingTaskLinkUpdates) {
    bulkWriter.update(userDoc.collection('tasks').doc(taskId), { projectId: link.projectId, areaId: link.areaId });
  }
  for (const t of transactions) bulkWriter.set(userDoc.collection('transactions').doc(t.id), { ...t.data, createdBy: uid });
  for (const t of transfers) bulkWriter.set(userDoc.collection('transfers').doc(t.id), { ...t.data, createdBy: uid });
  for (const r of budgetRules) bulkWriter.set(userDoc.collection('budgetRules').doc(r.id), r.data);
  await bulkWriter.flush();

  // Recompute currentBalance directly here rather than relying on live
  // triggers to backfill it — same reasoning as migrate-notion-to-firestore.ts.
  // Covers every account (not just the ones just written), since a
  // duplicate-matched existing account's balance also needs to reflect the
  // transactions/transfers just added against it.
  const [txSnap, transfersSnap, accountsSnap] = await Promise.all([
    userDoc.collection('transactions').get(),
    userDoc.collection('transfers').get(),
    userDoc.collection('accounts').get(),
  ]);
  const deltas = new Map<string, number>();
  for (const doc of txSnap.docs) {
    const t = doc.data();
    deltas.set(t.accountId, (deltas.get(t.accountId) ?? 0) + t.signedAmount);
  }
  for (const doc of transfersSnap.docs) {
    const t = doc.data();
    deltas.set(t.fromAccountId, (deltas.get(t.fromAccountId) ?? 0) - t.amount - (t.charges ?? 0));
    deltas.set(t.toAccountId, (deltas.get(t.toAccountId) ?? 0) + t.amount);
  }
  for (const doc of accountsSnap.docs) {
    const startingBalance = doc.data().startingBalance ?? 0;
    const currentBalance = startingBalance + (deltas.get(doc.id) ?? 0);
    bulkWriter.update(doc.ref, { currentBalance });
  }
  await bulkWriter.close();

  console.log(`accounts: recomputed currentBalance for ${accountsSnap.size} accounts (transactions + transfers)`);
  console.log('\nDone. Review every [warn] line above before trusting these numbers in the app.');
  console.log('Re-running this script overwrites the same migrated documents by id and re-checks for duplicates, it will not duplicate them.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
