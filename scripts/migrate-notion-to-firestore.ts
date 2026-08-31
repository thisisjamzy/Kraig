/**
 * One-time migration: the original Notion "Dreda" databases -> Firestore.
 *
 * This reads the five real Notion data sources this app was originally built against
 * (Accounts, Categories, Transactions, Transfers, Budget Line Items) and writes the
 * equivalent Firestore documents per PRD-FIREBASE.md section 5. Run it once against a real
 * Firebase project, before anyone has used the live app, then it is done, this is not a
 * recurring sync. Safe to re-run: migrated documents use a deterministic id (the Notion page
 * id itself, or a slug for accounts/categories), so re-running overwrites the same rows
 * instead of duplicating them, it will not touch anything the app itself creates afterward.
 *
 * Every ledger collection lives under users/{uid}/... now (see refs.ts's
 * and firestore.rules' headers — no more shared top-level collections, each
 * account's data is private), so this needs to know WHICH account to
 * migrate into.
 *
 * Setup:
 *   npm install @notionhq/client firebase-admin tsx --save-dev
 *   NOTION_API_KEY=<a Notion internal integration token, shared with these 5 databases>
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   TARGET_UID=<firebase auth uid> (or TARGET_EMAIL=<the account's email>)
 *   npx tsx scripts/migrate-notion-to-firestore.ts
 *
 * The data source ids below were fetched directly from the live workspace on 2026-08-30.
 * Verify they still resolve before running (Notion Settings > Connections, confirm this
 * integration still has access), a database's data source id changes if it is ever
 * duplicated or split. This workspace uses Notion's data-source model (a database can hold
 * more than one data source), so this queries by data source id via `notion.dataSources.query`,
 * not the older `notion.databases.query`. Check that method name against whatever
 * @notionhq/client version actually installs, this part of Notion's API is young and has
 * already changed shape once, fall back to `databases.query({database_id: <the same id>})`
 * if the installed SDK predates the data-source split.
 *
 * Known data gaps in the source data, read before trusting the output:
 *   - Notion never modeled a per-account currency, every account here was implicitly XAF.
 *     Every migrated account gets currency: 'XAF', fix by hand for any account actually held
 *     in a different currency.
 *   - Notion's Transaction Type select has 7 options (including "Transfers" and "Transfer",
 *     both present, a pre-existing typo in the live data) where the app's Categories model
 *     only has 3 (Expense, Income, Savings). Anything that is not a clean match is migrated
 *     with needsReview: true and the original value preserved in notionTransactionType,
 *     instead of guessed at.
 *   - Notion's Transfers database has no Date property, only Created time. Migrated transfers
 *     use Created time as date, which may not be the actual transfer date.
 *   - Notion's Transfers database has no Kind field. It is inferred here from the From/To
 *     accounts' Type (Savings Account on one side and not the other becomes "Wallet to
 *     savings" or "Savings to wallet", otherwise "Wallet to wallet").
 *   - Every Notion Budget Line Item becomes a one-off budgetRules doc pinned to its own Due
 *     Date, deliberately not merged into a recurring rule, see printConsolidationReport()
 *     below and the note in PRD-FIREBASE.md, inferring recurrence is exactly the judgment
 *     call this migration leaves to a person instead of a heuristic.
 */

import { Client } from '@notionhq/client';
import { db, Timestamp, requireTargetUid } from './lib/adminApp';

const NOTION_TOKEN = process.env.NOTION_API_KEY;
if (!NOTION_TOKEN) {
  throw new Error('Set NOTION_API_KEY to a Notion internal integration token shared with these databases.');
}
const notion = new Client({ auth: NOTION_TOKEN });

const bulkWriter = db.bulkWriter();

const DATA_SOURCES = {
  accounts: '3917e487-e9d4-8072-a3c6-000bcce108cc',
  categories: '3917e487-e9d4-80ce-a567-000b36d6f085',
  transactions: '3917e487-e9d4-80da-885e-000bad82ebc1',
  budgetLineItems: '3917e487-e9d4-8061-bbe6-000bcc8bb4c0',
  transfers: '3937e487-e9d4-8088-ab7e-000b85f82fce',
};

// ---------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------

async function queryAll(dataSourceId: string): Promise<any[]> {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function plainText(richText: any[] | undefined): string {
  return (richText ?? []).map((t: any) => t.plain_text).join('');
}

function relationIds(prop: any): string[] {
  return (prop?.relation ?? []).map((r: any) => r.id);
}

function firstRelationId(prop: any, label: string, pageId: string): string | undefined {
  const ids = relationIds(prop);
  if (ids.length > 1) {
    console.warn(`[warn] ${label} on Notion page ${pageId} has ${ids.length} related pages, using the first, check this record by hand`);
  }
  return ids[0];
}

function slugFor(name: string, prefix: string, seen: Set<string>): string {
  const base = prefix + '_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  let candidate = base || `${prefix}_unnamed`;
  let n = 2;
  while (seen.has(candidate)) {
    candidate = `${base}_${n++}`;
  }
  seen.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------------
// phase 1: accounts
// ---------------------------------------------------------------------------------

const accountIdMap = new Map<string, string>(); // Notion page id -> Firestore doc id
const accountTypeById = new Map<string, string>(); // Firestore doc id -> Type, needed for transfer Kind inference

async function migrateAccounts(userDoc: FirebaseFirestore.DocumentReference) {
  const pages = await queryAll(DATA_SOURCES.accounts);
  const seenSlugs = new Set<string>();
  for (const page of pages) {
    const p = page.properties;
    const name = plainText(p.Name?.title);
    const id = slugFor(name, 'acc', seenSlugs);
    accountIdMap.set(page.id, id);
    const type = p.Type?.select?.name ?? 'Cash';
    accountTypeById.set(id, type);
    const startingBalance = p['Starting Balance (XAF)']?.number ?? 0;
    bulkWriter.set(userDoc.collection('accounts').doc(id), {
      name,
      type,
      currency: 'XAF', // see the header comment: Notion never modeled currency, this always was XAF
      startingBalance,
      currentBalance: startingBalance, // corrected below, see recomputeAccountBalances()
      notes: plainText(p.Notes?.rich_text),
      archived: false, // Notion's "Status" was a formula, not a stored flag, nothing to carry over
      notSpendable: false,
      frozen: false,
      createdAt: Timestamp.fromDate(new Date(page.created_time)),
      updatedAt: Timestamp.now(),
    });
  }
  console.log(`accounts: migrated ${pages.length}`);
}

// ---------------------------------------------------------------------------------
// phase 2: categories
// ---------------------------------------------------------------------------------

const categoryIdMap = new Map<string, string>();

// The app's Categories.transactionType is a 3-value enum. Notion's Transaction Type select
// has 7 options in the live data, including a typo duplicate ("Transfers" vs "Transfer").
// Anything without a clean match is flagged, not guessed, see migrateCategories() below.
const TRANSACTION_TYPE_MAP: Record<string, 'Expense' | 'Income' | 'Savings' | undefined> = {
  Expense: 'Expense',
  Income: 'Income',
  Savings: 'Savings',
};

async function migrateCategories(userDoc: FirebaseFirestore.DocumentReference) {
  const pages = await queryAll(DATA_SOURCES.categories);
  const seenSlugs = new Set<string>();
  for (const page of pages) {
    const p = page.properties;
    const name = plainText(p.Name?.title);
    const id = slugFor(name, 'cat', seenSlugs);
    categoryIdMap.set(page.id, id);
    const notionType = p['Transaction Type']?.select?.name as string | undefined;
    const mapped = notionType ? TRANSACTION_TYPE_MAP[notionType] : undefined;
    const doc: Record<string, unknown> = {
      name,
      transactionType: mapped ?? 'Expense', // safe fallback, flagged below for a human to fix
      group: p.Group?.select?.name ?? null,
      notes: plainText(p.Notes?.rich_text),
      archived: false,
      createdAt: Timestamp.fromDate(new Date(page.created_time)),
      updatedAt: Timestamp.now(),
    };
    if (!mapped) {
      doc.needsReview = true;
      doc.notionTransactionType = notionType ?? null;
    }
    bulkWriter.set(userDoc.collection('categories').doc(id), doc);
  }
  console.log(`categories: migrated ${pages.length}`);
}

// ---------------------------------------------------------------------------------
// phase 3: transfers
// ---------------------------------------------------------------------------------

async function migrateTransfers(userDoc: FirebaseFirestore.DocumentReference, uid: string) {
  const pages = await queryAll(DATA_SOURCES.transfers);
  let migrated = 0;
  for (const page of pages) {
    const p = page.properties;
    const fromNotionId = firstRelationId(p.From, 'Transfers.From', page.id);
    const toNotionId = firstRelationId(p['Cash In'], 'Transfers.Cash In', page.id);
    const fromAccountId = fromNotionId ? accountIdMap.get(fromNotionId) : undefined;
    const toAccountId = toNotionId ? accountIdMap.get(toNotionId) : undefined;
    if (!fromAccountId || !toAccountId) {
      console.warn(`[skip] transfer ${page.id} is missing a resolved From/To account, migrate it by hand`);
      continue;
    }
    const fromType = accountTypeById.get(fromAccountId);
    const toType = accountTypeById.get(toAccountId);
    let kind: string;
    if (fromType === 'Savings Account' && toType !== 'Savings Account') kind = 'Savings to wallet';
    else if (fromType !== 'Savings Account' && toType === 'Savings Account') kind = 'Wallet to savings';
    else kind = 'Wallet to wallet';
    const createdAt = Timestamp.fromDate(new Date(page.created_time));
    bulkWriter.set(userDoc.collection('transfers').doc(page.id.replace(/-/g, '')), {
      date: createdAt, // Notion Transfers has no Date property, only Created time, see header comment
      description: plainText(p.Name?.title),
      fromAccountId,
      toAccountId,
      amount: p.Amount?.number ?? 0,
      kind,
      notes: plainText(p.Notes?.rich_text),
      createdBy: uid,
      createdAt,
    });
    migrated++;
  }
  console.log(`transfers: migrated ${migrated} of ${pages.length}`);
}

// ---------------------------------------------------------------------------------
// phase 4: transactions
// ---------------------------------------------------------------------------------

async function migrateTransactions(userDoc: FirebaseFirestore.DocumentReference, uid: string) {
  const pages = await queryAll(DATA_SOURCES.transactions);
  let migrated = 0;
  for (const page of pages) {
    const p = page.properties;
    const accountNotionId = firstRelationId(p.Accounts, 'Transactions.Accounts', page.id);
    const categoryNotionId = firstRelationId(p.Categories, 'Transactions.Categories', page.id);
    const accountId = accountNotionId ? accountIdMap.get(accountNotionId) : undefined;
    const categoryId = categoryNotionId ? categoryIdMap.get(categoryNotionId) : undefined;
    if (!accountId) {
      console.warn(`[skip] transaction ${page.id} has no resolved Account, migrate it by hand`);
      continue;
    }
    const dateStr: string | undefined = p.Date?.date?.start;
    if (!dateStr) {
      console.warn(`[skip] transaction ${page.id} has no Date, migrate it by hand`);
      continue;
    }
    const amount = p.Amount?.number ?? 0;
    const direction = p.Direction?.select?.name === 'Inflow' ? 'Inflow' : 'Outflow';
    const signedAmount = direction === 'Inflow' ? amount : -amount;
    const month = dateStr.slice(0, 7);
    bulkWriter.set(userDoc.collection('transactions').doc(page.id.replace(/-/g, '')), {
      date: Timestamp.fromDate(new Date(dateStr)),
      type: p.Type?.select?.name ?? 'Expense',
      description: plainText(p.Description?.title),
      accountId,
      categoryId: categoryId ?? null,
      amount,
      direction,
      signedAmount,
      month,
      createdBy: uid,
      createdAt: Timestamp.fromDate(new Date(page.created_time)),
      updatedAt: Timestamp.now(),
    });
    migrated++;
  }
  console.log(`transactions: migrated ${migrated} of ${pages.length}`);
}

// ---------------------------------------------------------------------------------
// phase 5: budget rules, faithful migration, plus a consolidation report, not a guess
// ---------------------------------------------------------------------------------

type ConsolidationCandidate = { ruleId: string; categoryId: string; name: string; plannedAmount: number };

async function migrateBudgetRules(userDoc: FirebaseFirestore.DocumentReference) {
  const pages = await queryAll(DATA_SOURCES.budgetLineItems);
  const candidates: ConsolidationCandidate[] = [];
  for (const page of pages) {
    const p = page.properties;
    const categoryNotionId = firstRelationId(p.Categories, 'BudgetLineItems.Categories', page.id);
    const categoryId = categoryNotionId ? categoryIdMap.get(categoryNotionId) : undefined;
    const accountNotionId = firstRelationId(p.Accounts, 'BudgetLineItems.Accounts', page.id);
    const accountId = accountNotionId ? accountIdMap.get(accountNotionId) : undefined;
    const name = plainText(p.Name?.title);
    const plannedAmount = p['Planned Amount']?.number ?? 0;
    const dueDate: string | undefined = p['Due Date']?.date?.start;
    const archived = p.Archive?.checkbox === true;
    const ruleId = 'rule_' + page.id.replace(/-/g, '');
    const anchor = dueDate ? Timestamp.fromDate(new Date(dueDate)) : Timestamp.now();
    bulkWriter.set(userDoc.collection('budgetRules').doc(ruleId), {
      categoryId: categoryId ?? null,
      description: name,
      budgetedAmount: plannedAmount,
      frequency: 'Once',
      interval: 1,
      anchorDate: anchor,
      endCondition: 'On Date',
      endOccurrences: null,
      endDate: dueDate ? anchor : null,
      accountId: accountId ?? null,
      tag: p.Tag?.select?.name ?? null,
      archived,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    // Notion's Due Date is a real deadline the household tracked — that's a
    // planned payment (src/shared/firestore/types.ts's FirestorePlannedPayment
    // header), a separate doc from the budgetRules cap above, not a field on
    // it (several planned payments can share one budgetRules category).
    if (dueDate && categoryId) {
      bulkWriter.set(userDoc.collection('plannedPayments').doc('payment_' + page.id.replace(/-/g, '')), {
        categoryId,
        description: name,
        amount: plannedAmount,
        frequency: 'Once',
        interval: 1,
        anchorDate: anchor,
        endCondition: 'Never',
        endOccurrences: null,
        endDate: null,
        accountId: accountId ?? null,
        archived,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    if (categoryId && !archived) {
      candidates.push({ ruleId, categoryId, name, plannedAmount });
    }
  }
  console.log(`budgetRules: migrated ${pages.length} (all as one-off rules, see the consolidation report below)`);
  printConsolidationReport(candidates);
}

function printConsolidationReport(rules: ConsolidationCandidate[]) {
  const groups = new Map<string, ConsolidationCandidate[]>();
  for (const rule of rules) {
    const key = `${rule.categoryId}::${rule.name.trim().toLowerCase()}::${rule.plannedAmount}`;
    const list = groups.get(key) ?? [];
    list.push(rule);
    groups.set(key, list);
  }
  const repeated = [...groups.values()].filter((list) => list.length >= 2).sort((a, b) => b.length - a.length);
  console.log(`\n--- recurrence consolidation candidates (${repeated.length}) ---`);
  console.log('Same category, name, and amount repeated across separate Notion Budget Line Items,');
  console.log('almost certainly the same recurring bill Notion could only represent as separate');
  console.log('one-off pages each month. Consider replacing each group below with one Monthly');
  console.log('budgetRules doc (see the Subscriptions and Entertainment rules already hand-authored');
  console.log('in sheets/SCHEMA.md for the shape a real recurring rule should take) instead of');
  console.log('leaving them as the one-off rules this script wrote.\n');
  for (const group of repeated) {
    console.log(`  "${group[0].name}" x${group.length}, ${group[0].plannedAmount}, rule ids: ${group.map((r) => r.ruleId).join(', ')}`);
  }
}

// ---------------------------------------------------------------------------------
// final pass: recompute account balances directly here, do not rely on the live Cloud
// Function triggers to backfill this. A bulk import is exactly the case those triggers were
// not built for, thousands of writes racing each other through FieldValue.increment during a
// one-time backfill is slower and riskier than computing the right total once, here, in the
// same script that wrote the source rows.
// ---------------------------------------------------------------------------------

async function recomputeAccountBalances(userDoc: FirebaseFirestore.DocumentReference) {
  const [txSnap, trSnap, accountsSnap] = await Promise.all([
    userDoc.collection('transactions').get(),
    userDoc.collection('transfers').get(),
    userDoc.collection('accounts').get(),
  ]);
  const deltas = new Map<string, number>();
  for (const doc of txSnap.docs) {
    const t = doc.data();
    deltas.set(t.accountId, (deltas.get(t.accountId) ?? 0) + t.signedAmount);
  }
  for (const doc of trSnap.docs) {
    const t = doc.data();
    deltas.set(t.fromAccountId, (deltas.get(t.fromAccountId) ?? 0) - t.amount);
    deltas.set(t.toAccountId, (deltas.get(t.toAccountId) ?? 0) + t.amount);
  }
  for (const doc of accountsSnap.docs) {
    const startingBalance = doc.data().startingBalance ?? 0;
    const currentBalance = startingBalance + (deltas.get(doc.id) ?? 0);
    bulkWriter.update(doc.ref, { currentBalance });
  }
  console.log(`accounts: recomputed currentBalance for ${accountsSnap.size} accounts`);
}

// ---------------------------------------------------------------------------------

async function main() {
  const uid = await requireTargetUid();
  const userDoc = db.collection('users').doc(uid);
  console.log(`Migrating Notion data into uid ${uid}...`);

  await migrateAccounts(userDoc);
  await migrateCategories(userDoc);
  await migrateTransfers(userDoc, uid);
  await migrateTransactions(userDoc, uid);
  await migrateBudgetRules(userDoc);
  await bulkWriter.flush(); // wait for every queued write above to land before reading any of it back
  await recomputeAccountBalances(userDoc);
  await bulkWriter.close(); // flush the recompute's updates too, then release the writer
  console.log('\nDone. Review every [warn] and [skip] line above, and the consolidation report,');
  console.log('before trusting these numbers in the app. Re-running this script overwrites the');
  console.log('same migrated documents by id, it will not touch anything the app creates afterward.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
