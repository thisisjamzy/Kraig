'use client';

// Settings > Data's import wizard. Four steps: upload a file, review any
// missing name-references (offering to auto-create the eligible ones),
// commit every row, then a summary. See dataEntities.ts's header for the
// overall design; this hook is the resolution/commit engine.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDocs, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  areasRef,
  areaRef,
  bucketsRef,
  bucketRef,
  accountsRef,
  accountRef,
  categoriesRef,
  categoryRef,
  budgetRuleRef,
  projectsRef,
  projectRef,
  taskRef,
  goalsRef,
  goalLineItemRef,
  debtsRef,
  debtRef,
} from '@/src/shared/firestore/refs';
import { ensureDefaultBucket } from '@/src/shared/firestore/buckets';
import { readWorkbookFile } from '@/src/shared/firestore/dataWorkbook';
import {
  ENTITY_ORDER,
  ENTITY_DEFS,
  type EntityKey,
  type RefNeed,
  type AreaDraft,
  type BucketDraft,
  type AccountDraft,
  type CategoryDraft,
  type BudgetDraft,
  type ProjectDraft,
  type TaskDraft,
  type GoalDraft,
  type GoalItemDraft,
  type DebtDraft,
  type RepaymentDraft,
  type TransactionDraft,
  type TransferDraft,
} from '@/src/shared/firestore/dataEntities';
import {
  createTransactionWithAggregation,
  createTransferWithAggregation,
  createGoal,
  createGoalLineItem,
  createDebt,
  recordRepayment,
  recomputeBudgetProgressForRuleCurrentMonth,
  type RepaymentDebt,
} from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import type {
  FirestoreArea,
  FirestoreBucket,
  FirestoreAccount,
  FirestoreCategory,
  FirestoreProject,
  FirestoreGoal,
  FirestoreDebt,
} from '@/src/shared/firestore/types';

type Step = 'upload' | 'review' | 'summary';

interface RuntimeRow {
  entityKey: EntityKey;
  rowNumber: number;
  draft: Record<string, unknown>;
  refs: RefNeed[];
}

interface MissingRef {
  key: string; // `${entityKey}::${name.toLowerCase()}`
  entityKey: EntityKey;
  name: string;
  mode: 'autoCreate' | 'hardRequired';
}

interface NameMaps {
  areas: Map<string, string>;
  accounts: Map<string, string>;
  categories: Map<string, string>;
  projects: Map<string, string>;
  goals: Map<string, string>;
  debts: Map<string, string>;
  // Buckets are scoped by area: `${areaId}::${name.toLowerCase()}`.
  buckets: Map<string, string>;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}
function bucketKey(areaId: string, name: string): string {
  return `${areaId}::${nameKey(name)}`;
}
function missingKey(entityKey: EntityKey, name: string): string {
  return `${entityKey}::${nameKey(name)}`;
}

export interface ParseSummary {
  entityKey: EntityKey;
  validCount: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
}

export interface CommitSummary {
  entityKey: EntityKey;
  created: number;
  skipped: number;
  skipReasons: string[];
  writeErrors: string[];
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [unrecognizedSheets, setUnrecognizedSheets] = useState<string[]>([]);
  const [parseSummaries, setParseSummaries] = useState<ParseSummary[]>([]);
  const [rowsByEntity, setRowsByEntity] = useState<Map<EntityKey, RuntimeRow[]>>(new Map());
  const [missingRefs, setMissingRefs] = useState<MissingRef[]>([]);
  const [autoCreateChoices, setAutoCreateChoices] = useState<Map<string, boolean>>(new Map());
  const [nameMaps, setNameMaps] = useState<NameMaps | null>(null);

  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState({ done: 0, total: 0 });
  const [commitSummaries, setCommitSummaries] = useState<CommitSummary[]>([]);

  function toggleAutoCreate(key: string) {
    setAutoCreateChoices((current) => {
      const next = new Map(current);
      next.set(key, !(current.get(key) ?? true));
      return next;
    });
  }

  async function handleFile(file: File) {
    if (!uid) return;
    setFileName(file.name);
    setUploadError(null);
    setLoading(true);
    try {
      const { sheets, unrecognizedSheetNames } = await readWorkbookFile(file);
      if (sheets.length === 0) {
        setUploadError('No recognizable sheets found — check the sheet names match a Dreda template.');
        setLoading(false);
        return;
      }
      setUnrecognizedSheets(unrecognizedSheetNames);

      // Parse every recognized sheet, in dependency order regardless of
      // the order sheets appear in the file.
      const rows = new Map<EntityKey, RuntimeRow[]>();
      const summaries: ParseSummary[] = [];
      const declared = Object.fromEntries(ENTITY_ORDER.map((k) => [k, new Set<string>()])) as Record<EntityKey, Set<string>>;

      for (const key of ENTITY_ORDER) {
        const sheet = sheets.find((s) => s.entityKey === key);
        if (!sheet) continue;
        const def = ENTITY_DEFS[key];
        const valid: RuntimeRow[] = [];
        const errors: { rowNumber: number; message: string }[] = [];
        sheet.rows.forEach((raw, i) => {
          const parsed = def.parseRow(raw, i + 2); // +2: header is row 1, data starts row 2
          if (parsed.draft === null) {
            if (parsed.errors.length) errors.push({ rowNumber: parsed.rowNumber, message: parsed.errors.join(' ') });
            return;
          }
          valid.push({ entityKey: key, rowNumber: parsed.rowNumber, draft: parsed.draft as Record<string, unknown>, refs: parsed.refs });
          const nameField = (parsed.draft as Record<string, unknown>).name ?? (parsed.draft as Record<string, unknown>).title;
          if (typeof nameField === 'string') declared[key].add(nameKey(nameField));
        });
        rows.set(key, valid);
        summaries.push({ entityKey: key, validCount: valid.length, errorCount: errors.length, errors });
      }

      // Fetch every entity that something else might reference by name.
      const [areasSnap, accountsSnap, categoriesSnap, projectsSnap, goalsSnap, debtsSnap, bucketsSnap] = await Promise.all([
        getDocs(areasRef(uid)),
        getDocs(accountsRef(uid)),
        getDocs(categoriesRef(uid)),
        getDocs(projectsRef(uid)),
        getDocs(goalsRef(uid)),
        getDocs(debtsRef(uid)),
        getDocs(bucketsRef(uid)),
      ]);
      const maps: NameMaps = {
        areas: new Map(areasSnap.docs.map((d) => [nameKey((d.data() as FirestoreArea).name), d.id])),
        accounts: new Map(accountsSnap.docs.map((d) => [nameKey((d.data() as FirestoreAccount).name), d.id])),
        categories: new Map(categoriesSnap.docs.map((d) => [nameKey((d.data() as FirestoreCategory).name), d.id])),
        projects: new Map(projectsSnap.docs.map((d) => [nameKey((d.data() as FirestoreProject).name), d.id])),
        goals: new Map(goalsSnap.docs.map((d) => [nameKey((d.data() as FirestoreGoal).name), d.id])),
        debts: new Map(debtsSnap.docs.map((d) => [nameKey((d.data() as FirestoreDebt).name), d.id])),
        buckets: new Map(
          bucketsSnap.docs.map((d) => {
            const b = d.data() as FirestoreBucket;
            return [bucketKey(b.areaId, b.name), d.id];
          })
        ),
      };

      // Collect every unresolved reference across every row, deduplicated.
      const missing = new Map<string, MissingRef>();
      for (const key of ENTITY_ORDER) {
        for (const row of rows.get(key) ?? []) {
          for (const ref of row.refs) {
            const already = maps[ref.entityKey as keyof NameMaps]?.has(nameKey(ref.name));
            const declaredHere = declared[ref.entityKey]?.has(nameKey(ref.name));
            if (already || declaredHere) continue;
            const k = missingKey(ref.entityKey, ref.name);
            if (!missing.has(k)) missing.set(k, { key: k, entityKey: ref.entityKey, name: ref.name, mode: ref.mode });
          }
        }
      }

      setRowsByEntity(rows);
      setParseSummaries(summaries);
      setNameMaps(maps);
      setMissingRefs([...missing.values()]);
      setAutoCreateChoices(new Map([...missing.values()].filter((m) => m.mode === 'autoCreate').map((m) => [m.key, true])));
      setStep('review');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not read that file.');
    } finally {
      setLoading(false);
    }
  }

  function cancelReview() {
    setStep('upload');
    setFileName(null);
    setRowsByEntity(new Map());
    setParseSummaries([]);
    setMissingRefs([]);
    setAutoCreateChoices(new Map());
    setNameMaps(null);
  }

  // --- Commit ------------------------------------------------------------

  async function createMinimal(entityKey: EntityKey, name: string, hint: Record<string, unknown>): Promise<string> {
    if (!uid) throw new Error('Not signed in.');
    switch (entityKey) {
      case 'areas': {
        const id = crypto.randomUUID();
        await setDoc(areaRef(uid, id), {
          name,
          emoji: null,
          color: PROJECT_COLORS[0],
          description: 'Auto-created during import.',
          archived: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      }
      case 'categories': {
        const id = crypto.randomUUID();
        const transactionType = (hint.transactionType as 'Expense' | 'Income' | 'Savings') || 'Expense';
        await setDoc(categoryRef(uid, id), {
          name,
          transactionType,
          group: null,
          notes: 'Auto-created during import.',
          archived: false,
        });
        return id;
      }
      case 'buckets': {
        const areaId = hint.areaId as string;
        const areaColor = (hint.areaColor as string) || PROJECT_COLORS[0];
        const id = crypto.randomUUID();
        await setDoc(bucketRef(uid, id), {
          name,
          emoji: null,
          color: areaColor,
          description: 'Auto-created during import.',
          areaId,
          archived: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      }
      case 'projects': {
        const areaId = (hint.areaId as string | null) ?? null;
        const id = crypto.randomUUID();
        const bucketId = areaId ? await ensureDefaultBucket(uid, areaId, PROJECT_COLORS[0]) : null;
        await setDoc(projectRef(uid, id), {
          name,
          emoji: null,
          areaId,
          bucketId,
          color: PROJECT_COLORS[0],
          priority: 'Medium',
          startDate: null,
          endDate: null,
          originalEndDate: null,
          rescheduleCount: 0,
          status: 'Active',
          description: 'Auto-created during import.',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      }
      case 'goals': {
        return createGoal(uid, {
          name,
          description: 'Auto-created during import.',
          deadline: null,
          currency: (hint.currency as string) || ctx.base,
        });
      }
      default:
        throw new Error(`${entityKey} isn't auto-create eligible.`);
    }
  }

  async function handleCommit() {
    if (!uid || !nameMaps || committing) return;
    setCommitting(true);
    setStep('summary');

    // Live, mutable copies — grow as this pass creates things, so a later
    // row referencing a name this same import just created (explicitly or
    // via auto-create) resolves to the real new id.
    const maps: NameMaps = {
      areas: new Map(nameMaps.areas),
      accounts: new Map(nameMaps.accounts),
      categories: new Map(nameMaps.categories),
      projects: new Map(nameMaps.projects),
      goals: new Map(nameMaps.goals),
      debts: new Map(nameMaps.debts),
      buckets: new Map(nameMaps.buckets),
    };
    const areaColorById = new Map<string, string>();
    // A task mirrors its project's areaId/bucketId (never set directly) —
    // recorded whenever a project is created this pass; looked up via
    // getDoc the first time a task references a pre-existing one.
    const projectMetaById = new Map<string, { areaId: string | null; bucketId: string | null }>();
    // recordRepayment needs the debt's own {id, name, debtType,
    // principalAmount, paymentPlan} — recorded when created this pass,
    // fetched via getDoc the first time a repayment references a
    // pre-existing one.
    const debtRecordById = new Map<string, RepaymentDebt>();

    async function projectMetaFor(projectId: string): Promise<{ areaId: string | null; bucketId: string | null }> {
      const cached = projectMetaById.get(projectId);
      if (cached) return cached;
      const snap = await getDoc(projectRef(uid!, projectId));
      const data = snap.data();
      const meta = { areaId: data?.areaId ?? null, bucketId: data?.bucketId ?? null };
      projectMetaById.set(projectId, meta);
      return meta;
    }

    async function debtRecordFor(debtId: string): Promise<RepaymentDebt> {
      const cached = debtRecordById.get(debtId);
      if (cached) return cached;
      const snap = await getDoc(debtRef(uid!, debtId));
      const data = snap.data();
      if (!data) throw new Error('This debt no longer exists.');
      const record: RepaymentDebt = {
        id: debtId,
        name: data.name,
        debtType: data.debtType,
        principalAmount: data.principalAmount,
        paymentPlan: data.paymentPlan,
      };
      debtRecordById.set(debtId, record);
      return record;
    }

    // Resolves one row's refs against the live maps, auto-creating
    // whatever the user confirmed and applying onDecline for whatever they
    // didn't. A non-null skipReason means the whole row must be skipped.
    async function resolveRefs(row: RuntimeRow): Promise<{ resolved: Record<string, string | null>; skipReason: string | null }> {
      const resolved: Record<string, string | null> = {};
      for (const ref of row.refs) {
        const map = maps[ref.entityKey as keyof NameMaps];
        let id: string | undefined;
        if (ref.entityKey === 'buckets') {
          const areaId = resolved.areaId ?? (row.draft.areaId as string | undefined);
          id = areaId ? map.get(bucketKey(areaId, ref.name)) : undefined;
        } else {
          id = map.get(nameKey(ref.name));
        }
        if (id) {
          resolved[ref.field] = id;
          continue;
        }
        const missKey = missingKey(ref.entityKey, ref.name);
        const wantsAutoCreate = ref.mode === 'autoCreate' && (autoCreateChoices.get(missKey) ?? true);
        if (wantsAutoCreate) {
          const hint: Record<string, unknown> = { ...row.draft };
          if (ref.entityKey === 'buckets') {
            const areaId = resolved.areaId ?? (row.draft.areaId as string | undefined);
            if (!areaId) return { resolved, skipReason: `Bucket "${ref.name}" needs an Area, and none was resolved.` };
            hint.areaId = areaId;
            hint.areaColor = areaColorById.get(areaId);
          }
          try {
            const newId = await createMinimal(ref.entityKey, ref.name, hint);
            if (ref.entityKey === 'buckets') {
              const areaId = hint.areaId as string;
              map.set(bucketKey(areaId, ref.name), newId);
            } else {
              map.set(nameKey(ref.name), newId);
            }
            resolved[ref.field] = newId;
            continue;
          } catch (error) {
            return { resolved, skipReason: error instanceof Error ? error.message : `Could not auto-create ${ref.entityKey} "${ref.name}".` };
          }
        }
        if (ref.mode === 'hardRequired') {
          return { resolved, skipReason: `${ref.entityKey} "${ref.name}" not found.` };
        }
        // Declined auto-create: apply onDecline.
        if (ref.onDecline === 'skipRow') {
          return { resolved, skipReason: `${ref.entityKey} "${ref.name}" wasn't created.` };
        }
        resolved[ref.field] = null;
      }
      return { resolved, skipReason: null };
    }

    // Performs the actual write for one row, once every reference is
    // resolved to a real id (or null, where the schema allows it).
    async function writeRow(entityKey: EntityKey, draft: Record<string, unknown>, resolved: Record<string, string | null>): Promise<void> {
      switch (entityKey) {
        case 'areas': {
          const d = draft as unknown as AreaDraft;
          const id = crypto.randomUUID();
          await setDoc(areaRef(uid!, id), {
            name: d.name,
            emoji: d.emoji,
            color: d.color,
            description: d.description,
            archived: d.archived,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          maps.areas.set(nameKey(d.name), id);
          areaColorById.set(id, d.color);
          return;
        }
        case 'buckets': {
          const d = draft as unknown as BucketDraft;
          const areaId = resolved.areaId!;
          const id = crypto.randomUUID();
          await setDoc(bucketRef(uid!, id), {
            name: d.name,
            emoji: d.emoji,
            color: d.color,
            description: d.description,
            areaId,
            archived: d.archived,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          maps.buckets.set(bucketKey(areaId, d.name), id);
          return;
        }
        case 'accounts': {
          const d = draft as unknown as AccountDraft;
          const id = crypto.randomUUID();
          await setDoc(accountRef(uid!, id), {
            name: d.name,
            type: d.type,
            currency: d.currency,
            startingBalance: d.startingBalance,
            currentBalance: d.startingBalance,
            notes: d.notes,
            archived: d.archived,
            notSpendable: d.notSpendable,
            frozen: d.frozen,
          });
          maps.accounts.set(nameKey(d.name), id);
          return;
        }
        case 'categories': {
          const d = draft as unknown as CategoryDraft;
          const id = crypto.randomUUID();
          await setDoc(categoryRef(uid!, id), {
            name: d.name,
            transactionType: d.transactionType,
            group: d.group,
            notes: d.notes,
            archived: d.archived,
          });
          maps.categories.set(nameKey(d.name), id);
          return;
        }
        case 'budgets': {
          const d = draft as unknown as BudgetDraft;
          const id = `rule_${crypto.randomUUID().slice(0, 8)}`;
          await setDoc(budgetRuleRef(uid!, id), {
            categoryId: resolved.categoryId!,
            description: d.description,
            budgetedAmount: d.budgetedAmount,
            frequency: d.frequency,
            interval: 1,
            anchorDate: Timestamp.fromDate(new Date()),
            endCondition: 'Never',
            endOccurrences: null,
            endDate: null,
            accountId: resolved.accountId ?? null,
            tag: d.tag ?? '',
            archived: d.archived,
          });
          await recomputeBudgetProgressForRuleCurrentMonth(uid!, id);
          return;
        }
        case 'projects': {
          const d = draft as unknown as ProjectDraft;
          const id = crypto.randomUUID();
          const areaId = resolved.areaId ?? null;
          const bucketId = resolved.bucketId ?? null;
          const endDate = d.endDate ? Timestamp.fromDate(d.endDate) : null;
          await setDoc(projectRef(uid!, id), {
            name: d.name,
            emoji: null,
            areaId,
            bucketId,
            color: d.color,
            priority: d.priority,
            startDate: d.startDate ? Timestamp.fromDate(d.startDate) : null,
            endDate,
            originalEndDate: endDate,
            rescheduleCount: 0,
            status: d.status,
            description: d.description,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          maps.projects.set(nameKey(d.name), id);
          projectMetaById.set(id, { areaId, bucketId });
          return;
        }
        case 'tasks': {
          const d = draft as unknown as TaskDraft;
          const id = crypto.randomUUID();
          const projectId = resolved.projectId ?? null;
          const meta = projectId ? await projectMetaFor(projectId) : { areaId: null, bucketId: null };
          const done = d.status === 'Done';
          const dueDate = d.dueDate ? Timestamp.fromDate(d.dueDate) : null;
          await setDoc(taskRef(uid!, id), {
            title: d.title,
            emoji: null,
            type: d.type,
            priority: d.priority,
            projectId,
            areaId: meta.areaId,
            bucketId: meta.bucketId,
            parentTaskId: null,
            done,
            status: d.status,
            startTime: d.startTime ? Timestamp.fromDate(d.startTime) : null,
            dueDate,
            originalDueDate: dueDate,
            rescheduleCount: 0,
            completedAt: done ? serverTimestamp() : null,
            calendarEventId: null,
            dependsOnTaskId: null,
            estimatedCost: null,
            linkedTransactionId: null,
            notes: d.notes,
            tags: d.tags,
            archived: false,
            createdBy: uid!,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return;
        }
        case 'goals': {
          const d = draft as unknown as GoalDraft;
          const id = await createGoal(uid!, {
            name: d.name,
            description: d.description,
            deadline: d.deadline,
            currency: d.currency,
          });
          maps.goals.set(nameKey(d.name), id);
          return;
        }
        case 'goalItems': {
          const d = draft as unknown as GoalItemDraft;
          const goalId = resolved.goalId!;
          const lineItemId = await createGoalLineItem(uid!, goalId, {
            name: d.name,
            description: d.description,
            amount: d.amount,
            priority: d.priority,
            necessity: d.necessity,
          });
          if (d.completed) {
            await updateDoc(goalLineItemRef(uid!, goalId, lineItemId), {
              completed: true,
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          return;
        }
        case 'debts': {
          const d = draft as unknown as DebtDraft;
          const id = await createDebt(
            uid!,
            {
              name: d.name,
              description: d.description,
              debtType: d.debtType,
              accountId: resolved.accountId ?? null,
              principalAmount: d.principalAmount,
              currency: d.currency,
              priority: d.priority,
              startDate: d.startDate,
              notes: d.notes,
            },
            ctx
          );
          maps.debts.set(nameKey(d.name), id);
          debtRecordById.set(id, {
            id,
            name: d.name,
            debtType: d.debtType,
            principalAmount: d.principalAmount,
            paymentPlan: { type: 'none' },
          });
          return;
        }
        case 'repayments': {
          const d = draft as unknown as RepaymentDraft;
          const debtId = resolved.debtId!;
          const debt = await debtRecordFor(debtId);
          await recordRepayment(
            uid!,
            debt,
            {
              amount: d.amount,
              date: d.date,
              notes: d.notes,
              method: d.method,
              accountId: resolved.accountId ?? null,
              categoryId: null,
            },
            ctx
          );
          return;
        }
        case 'transactions': {
          const d = draft as unknown as TransactionDraft;
          await createTransactionWithAggregation(
            {
              id: crypto.randomUUID(),
              date: d.date,
              type: d.type,
              description: d.description,
              accountId: resolved.accountId!,
              categoryId: resolved.categoryId ?? null,
              amount: d.amount,
              direction: d.type === 'Income' ? 'Inflow' : 'Outflow',
              createdBy: uid!,
            },
            ctx
          );
          return;
        }
        case 'transfers': {
          const d = draft as unknown as TransferDraft;
          await createTransferWithAggregation({
            id: crypto.randomUUID(),
            date: d.date,
            description: d.notes || d.kind,
            fromAccountId: resolved.fromAccountId!,
            toAccountId: resolved.toAccountId!,
            amount: d.amount,
            charges: d.charges,
            kind: d.kind,
            createdBy: uid!,
          });
          return;
        }
        default:
          return;
      }
    }

    const totalRows = ENTITY_ORDER.reduce((sum, key) => sum + (rowsByEntity.get(key)?.length ?? 0), 0);
    setCommitProgress({ done: 0, total: totalRows });
    let done = 0;
    const summaries: CommitSummary[] = [];

    for (const entityKey of ENTITY_ORDER) {
      const rows = rowsByEntity.get(entityKey) ?? [];
      let created = 0;
      let skipped = 0;
      const skipReasons: string[] = [];
      const writeErrors: string[] = [];

      for (const row of rows) {
        const { resolved, skipReason } = await resolveRefs(row);
        if (skipReason) {
          skipped++;
          skipReasons.push(`Row ${row.rowNumber}: ${skipReason}`);
          done++;
          setCommitProgress({ done, total: totalRows });
          continue;
        }
        try {
          await writeRow(entityKey, row.draft, resolved);
          created++;
        } catch (error) {
          writeErrors.push(`Row ${row.rowNumber}: ${error instanceof Error ? error.message : 'Write failed.'}`);
        }
        done++;
        setCommitProgress({ done, total: totalRows });
      }

      if (rows.length > 0) summaries.push({ entityKey, created, skipped, skipReasons, writeErrors });
    }

    setCommitSummaries(summaries);
    setCommitting(false);
  }

  function goBack() {
    if (step !== 'upload') {
      cancelReview();
      return;
    }
    router.push('/settings');
  }

  return {
    step,
    fileName,
    uploadError,
    loading,
    handleFile,

    unrecognizedSheets,
    parseSummaries,
    missingRefs,
    autoCreateChoices,
    toggleAutoCreate,
    cancelReview,
    handleCommit,

    committing,
    commitProgress,
    commitSummaries,

    goBack,
  };
}
