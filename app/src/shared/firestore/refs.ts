'use client';

// Typed collection/document references — one place that knows the actual
// collection names (including the statsMonthly/statsBudgetProgress naming
// resolution noted in firestore.rules), so a typo can't silently create a
// new empty collection instead of hitting the real one.
//
// Every collection below (except users/{uid} itself) is a SUBCOLLECTION of
// users/{uid} — each account gets its own private set of wallets,
// categories, transactions, etc., never shared with any other account
// (firestore.rules enforces the same boundary: every one of these paths
// requires request.auth.uid == uid). That's why every function here takes
// `uid` as its first argument rather than reading "the current user" some
// other way — an explicit, impossible-to-forget parameter, and it keeps
// this module free of any dependency on auth state or React.

import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import type {
  FirestoreAccount,
  FirestoreCategory,
  FirestoreTransaction,
  FirestoreTransfer,
  FirestoreTransactionTemplate,
  FirestorePlannedPayment,
  FirestoreSettings,
  FirestoreTaskTypesSettings,
  FirestoreInsightsSettings,
  FirestoreFinanceSettings,
  FirestoreExchangeRate,
  FirestoreBucket,
  FirestoreBucketLineItem,
  FirestoreDebt,
  FirestoreDebtActivity,
  FirestoreRepayment,
  StatsHome,
  StatsMonthly,
  FirestoreUserDoc,
  FirestoreArea,
  FirestoreSection,
  FirestoreProject,
  FirestoreTask,
  FirestoreReconciliation,
  FirestoreAllocation,
  FirestoreOverspendJustification,
  FirestoreCalendarEvent,
  FirestoreCalendarSyncState,
  FirestoreBudgetMonth,
  FirestorePaymentQueueEntry,
  FirestoreMigration,
} from './types';
import type { FirestoreAuditReport } from './auditReport';

function sub(uid: string, name: string) {
  return collection(getFirebaseFirestore(), 'users', uid, name);
}
function subDoc(uid: string, name: string, id: string) {
  return doc(getFirebaseFirestore(), 'users', uid, name, id);
}

export function accountsRef(uid: string): CollectionReference<FirestoreAccount> {
  return sub(uid, 'accounts') as CollectionReference<FirestoreAccount>;
}
// DocumentReference is typed without `id` — it's synthesized by the read
// hooks from snap.id (see src/shared/firestore/hooks.ts), never an actual
// stored field, so a setDoc/updateDoc call shouldn't need to supply one.
export function accountRef(uid: string, id: string): DocumentReference<Omit<FirestoreAccount, 'id'>> {
  return subDoc(uid, 'accounts', id) as DocumentReference<Omit<FirestoreAccount, 'id'>>;
}

// PRD-AUDIT-RECONCILIATION.md section 2.2 — the one household-wide
// "Unjustified" wallet, a fixed, predictable doc id (rather than a
// generated one) so every call site can reference it directly without a
// query. A real accounts/{id} document (see FirestoreAccount.isSystemWallet)
// so it can move money through the ordinary transfer mechanism unchanged.
export const UNJUSTIFIED_WALLET_ID = 'unjustified';
export function unjustifiedWalletRef(uid: string): DocumentReference<Omit<FirestoreAccount, 'id'>> {
  return accountRef(uid, UNJUSTIFIED_WALLET_ID);
}

export function categoriesRef(uid: string): CollectionReference<FirestoreCategory> {
  return sub(uid, 'categories') as CollectionReference<FirestoreCategory>;
}
export function categoryRef(uid: string, id: string): DocumentReference<Omit<FirestoreCategory, 'id'>> {
  return subDoc(uid, 'categories', id) as DocumentReference<Omit<FirestoreCategory, 'id'>>;
}

export function transactionsRef(uid: string): CollectionReference<FirestoreTransaction> {
  return sub(uid, 'transactions') as CollectionReference<FirestoreTransaction>;
}
export function transactionRef(uid: string, id: string): DocumentReference<Omit<FirestoreTransaction, 'id'>> {
  return subDoc(uid, 'transactions', id) as DocumentReference<Omit<FirestoreTransaction, 'id'>>;
}

export function transfersRef(uid: string): CollectionReference<FirestoreTransfer> {
  return sub(uid, 'transfers') as CollectionReference<FirestoreTransfer>;
}
export function transferRef(uid: string, id: string): DocumentReference<Omit<FirestoreTransfer, 'id'>> {
  return subDoc(uid, 'transfers', id) as DocumentReference<Omit<FirestoreTransfer, 'id'>>;
}

export function transactionTemplatesRef(uid: string): CollectionReference<FirestoreTransactionTemplate> {
  return sub(uid, 'transactionTemplates') as CollectionReference<FirestoreTransactionTemplate>;
}
export function transactionTemplateRef(uid: string, id: string): DocumentReference<Omit<FirestoreTransactionTemplate, 'id'>> {
  return subDoc(uid, 'transactionTemplates', id) as DocumentReference<Omit<FirestoreTransactionTemplate, 'id'>>;
}

export function plannedPaymentsRef(uid: string): CollectionReference<FirestorePlannedPayment> {
  return sub(uid, 'plannedPayments') as CollectionReference<FirestorePlannedPayment>;
}
export function plannedPaymentRef(uid: string, id: string): DocumentReference<Omit<FirestorePlannedPayment, 'id'>> {
  return subDoc(uid, 'plannedPayments', id) as DocumentReference<Omit<FirestorePlannedPayment, 'id'>>;
}

export function bucketsRef(uid: string): CollectionReference<FirestoreBucket> {
  return sub(uid, 'goals') as CollectionReference<FirestoreBucket>;
}
export function bucketRef(uid: string, id: string): DocumentReference<Omit<FirestoreBucket, 'id'>> {
  return subDoc(uid, 'goals', id) as DocumentReference<Omit<FirestoreBucket, 'id'>>;
}
export function bucketLineItemsRef(uid: string, goalId: string): CollectionReference<FirestoreBucketLineItem> {
  return collection(getFirebaseFirestore(), 'users', uid, 'goals', goalId, 'lineItems') as CollectionReference<FirestoreBucketLineItem>;
}
export function bucketLineItemRef(
  uid: string,
  goalId: string,
  lineItemId: string
): DocumentReference<Omit<FirestoreBucketLineItem, 'id'>> {
  return doc(getFirebaseFirestore(), 'users', uid, 'goals', goalId, 'lineItems', lineItemId) as DocumentReference<
    Omit<FirestoreBucketLineItem, 'id'>
  >;
}

export function debtsRef(uid: string): CollectionReference<FirestoreDebt> {
  return sub(uid, 'debts') as CollectionReference<FirestoreDebt>;
}
export function debtRef(uid: string, id: string): DocumentReference<Omit<FirestoreDebt, 'id'>> {
  return subDoc(uid, 'debts', id) as DocumentReference<Omit<FirestoreDebt, 'id'>>;
}
export function repaymentsRef(uid: string, debtId: string): CollectionReference<FirestoreRepayment> {
  return collection(getFirebaseFirestore(), 'users', uid, 'debts', debtId, 'repayments') as CollectionReference<FirestoreRepayment>;
}
export function debtActivityRef(uid: string, debtId: string): CollectionReference<FirestoreDebtActivity> {
  return collection(getFirebaseFirestore(), 'users', uid, 'debts', debtId, 'activity') as CollectionReference<FirestoreDebtActivity>;
}
export function repaymentRef(
  uid: string,
  debtId: string,
  repaymentId: string
): DocumentReference<Omit<FirestoreRepayment, 'id'>> {
  return doc(getFirebaseFirestore(), 'users', uid, 'debts', debtId, 'repayments', repaymentId) as DocumentReference<
    Omit<FirestoreRepayment, 'id'>
  >;
}

// PRD-BUDGETS-V2.md section 4.4 — the budget-move ledger (leftovers
// reallocated, overspends covered), see src/shared/firestore/allocations.ts.
export function allocationsRef(uid: string): CollectionReference<FirestoreAllocation> {
  return sub(uid, 'allocations') as CollectionReference<FirestoreAllocation>;
}
export function allocationRef(uid: string, id: string): DocumentReference<Omit<FirestoreAllocation, 'id'>> {
  return subDoc(uid, 'allocations', id) as DocumentReference<Omit<FirestoreAllocation, 'id'>>;
}

// Overspend settlements (Cover or justify), see src/shared/firestore/overspend.ts.
export function overspendJustificationsRef(uid: string): CollectionReference<FirestoreOverspendJustification> {
  return sub(uid, 'overspendJustifications') as CollectionReference<FirestoreOverspendJustification>;
}
export function overspendJustificationRef(uid: string, id: string): DocumentReference<Omit<FirestoreOverspendJustification, 'id'>> {
  return subDoc(uid, 'overspendJustifications', id) as DocumentReference<Omit<FirestoreOverspendJustification, 'id'>>;
}

export function areasRef(uid: string): CollectionReference<FirestoreArea> {
  return sub(uid, 'areas') as CollectionReference<FirestoreArea>;
}
export function areaRef(uid: string, id: string): DocumentReference<Omit<FirestoreArea, 'id'>> {
  return subDoc(uid, 'areas', id) as DocumentReference<Omit<FirestoreArea, 'id'>>;
}

export function sectionsRef(uid: string): CollectionReference<FirestoreSection> {
  return sub(uid, 'buckets') as CollectionReference<FirestoreSection>;
}
export function sectionRef(uid: string, id: string): DocumentReference<Omit<FirestoreSection, 'id'>> {
  return subDoc(uid, 'buckets', id) as DocumentReference<Omit<FirestoreSection, 'id'>>;
}

export function projectsRef(uid: string): CollectionReference<FirestoreProject> {
  return sub(uid, 'projects') as CollectionReference<FirestoreProject>;
}
export function projectRef(uid: string, id: string): DocumentReference<Omit<FirestoreProject, 'id'>> {
  return subDoc(uid, 'projects', id) as DocumentReference<Omit<FirestoreProject, 'id'>>;
}

export function tasksRef(uid: string): CollectionReference<FirestoreTask> {
  return sub(uid, 'tasks') as CollectionReference<FirestoreTask>;
}
export function taskRef(uid: string, id: string): DocumentReference<Omit<FirestoreTask, 'id'>> {
  return subDoc(uid, 'tasks', id) as DocumentReference<Omit<FirestoreTask, 'id'>>;
}

export function settingsRef(uid: string): DocumentReference<FirestoreSettings> {
  return subDoc(uid, 'settings', 'app') as DocumentReference<FirestoreSettings>;
}

export function insightsSettingsRef(uid: string): DocumentReference<FirestoreInsightsSettings> {
  return subDoc(uid, 'settings', 'insights') as DocumentReference<FirestoreInsightsSettings>;
}

export function financeSettingsRef(uid: string): DocumentReference<FirestoreFinanceSettings> {
  return subDoc(uid, 'settings', 'finance') as DocumentReference<FirestoreFinanceSettings>;
}

export function taskTypesRef(uid: string): DocumentReference<FirestoreTaskTypesSettings> {
  return subDoc(uid, 'settings', 'taskTypes') as DocumentReference<FirestoreTaskTypesSettings>;
}

// Google Calendar sync (src/shared/calendarSync): mirrored Google events,
// keyed by their Google event id so a re-pull updates instead of
// duplicating, and the sync's own state doc.
export function calendarEventsRef(uid: string): CollectionReference<FirestoreCalendarEvent> {
  return sub(uid, 'calendarEvents') as CollectionReference<FirestoreCalendarEvent>;
}
export function calendarEventRef(uid: string, googleEventId: string): DocumentReference<Omit<FirestoreCalendarEvent, 'id'>> {
  return subDoc(uid, 'calendarEvents', calendarEventDocId(googleEventId)) as DocumentReference<Omit<FirestoreCalendarEvent, 'id'>>;
}
/** Google event ids are base32hex (plus "_20260928T090000Z" on a recurring
 * instance), so they're already valid doc ids — a "/" is replaced just in
 * case, since it would split the path. */
export function calendarEventDocId(googleEventId: string): string {
  return googleEventId.replace(/\//g, '_');
}
export function calendarSyncStateRef(uid: string): DocumentReference<FirestoreCalendarSyncState> {
  return subDoc(uid, 'settings', 'calendarSync') as DocumentReference<FirestoreCalendarSyncState>;
}

export function exchangeRatesRef(uid: string): CollectionReference<FirestoreExchangeRate> {
  return sub(uid, 'exchangeRates') as CollectionReference<FirestoreExchangeRate>;
}
export function exchangeRateRef(uid: string, code: string): DocumentReference<Omit<FirestoreExchangeRate, 'id'>> {
  return subDoc(uid, 'exchangeRates', code) as DocumentReference<Omit<FirestoreExchangeRate, 'id'>>;
}

/** users/{uid}/notifications/{id}: src/shared/notifications/types.ts. */
export function notificationsRef(uid: string): CollectionReference {
  return sub(uid, 'notifications') as CollectionReference;
}
export function notificationRef(uid: string, id: string): DocumentReference {
  return subDoc(uid, 'notifications', id) as DocumentReference;
}
export function planSnapshotRef(uid: string): DocumentReference {
  return subDoc(uid, 'settings', 'planSnapshot') as DocumentReference;
}
export function notificationPrefsRef(uid: string): DocumentReference {
  return subDoc(uid, 'settings', 'notifications') as DocumentReference;
}

export function statsHomeRef(uid: string): DocumentReference<StatsHome> {
  return subDoc(uid, 'stats', 'home') as DocumentReference<StatsHome>;
}
export function statsMonthlyRef(uid: string, month: string): DocumentReference<StatsMonthly> {
  return subDoc(uid, 'statsMonthly', month) as DocumentReference<StatsMonthly>;
}

// Generated financial audit reports (src/shared/firestore/auditReport.ts) —
// each one an immutable snapshot, never overwritten after creation.
export function auditReportsRef(uid: string): CollectionReference<FirestoreAuditReport> {
  return sub(uid, 'auditReports') as CollectionReference<FirestoreAuditReport>;
}
export function auditReportRef(uid: string, id: string): DocumentReference<Omit<FirestoreAuditReport, 'id'>> {
  return subDoc(uid, 'auditReports', id) as DocumentReference<Omit<FirestoreAuditReport, 'id'>>;
}

// PRD-AUDIT-RECONCILIATION.md section 2.2 — history of "what do your
// accounts actually hold right now" checks, see src/shared/firestore/
// unaccountedBalance.ts.
export function reconciliationsRef(uid: string): CollectionReference<FirestoreReconciliation> {
  return sub(uid, 'reconciliations') as CollectionReference<FirestoreReconciliation>;
}
export function reconciliationRef(uid: string, id: string): DocumentReference<Omit<FirestoreReconciliation, 'id'>> {
  return subDoc(uid, 'reconciliations', id) as DocumentReference<Omit<FirestoreReconciliation, 'id'>>;
}

export function userRef(uid: string): DocumentReference<FirestoreUserDoc> {
  return doc(getFirebaseFirestore(), 'users', uid) as DocumentReference<FirestoreUserDoc>;
}

export function budgetMonthsRef(uid: string): CollectionReference<FirestoreBudgetMonth> {
  return sub(uid, 'budgetMonths') as CollectionReference<FirestoreBudgetMonth>;
}
export function budgetMonthRef(uid: string, month: string): DocumentReference<Omit<FirestoreBudgetMonth, 'id'>> {
  return subDoc(uid, 'budgetMonths', month) as DocumentReference<Omit<FirestoreBudgetMonth, 'id'>>;
}

export function paymentQueueRef(uid: string): CollectionReference<FirestorePaymentQueueEntry> {
  return sub(uid, 'paymentQueue') as CollectionReference<FirestorePaymentQueueEntry>;
}
export function paymentQueueEntryRef(uid: string, id: string): DocumentReference<Omit<FirestorePaymentQueueEntry, 'id'>> {
  return subDoc(uid, 'paymentQueue', id) as DocumentReference<Omit<FirestorePaymentQueueEntry, 'id'>>;
}

export function migrationRef(uid: string, id: string): DocumentReference<Omit<FirestoreMigration, 'id'>> {
  return subDoc(uid, 'migrations', id) as DocumentReference<Omit<FirestoreMigration, 'id'>>;
}
