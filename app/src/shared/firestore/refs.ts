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

import { collection, doc, type CollectionReference, type DocumentReference, type Timestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import type {
  FirestoreAccount,
  FirestoreCategory,
  FirestoreTransaction,
  FirestoreTransfer,
  FirestoreBudgetRule,
  FirestorePlannedPayment,
  FirestoreSettings,
  FirestoreBudgetPlan,
  FirestoreExchangeRate,
  StatsHome,
  StatsMonthly,
  StatsBudgetProgress,
  FirestoreUserDoc,
} from './types';

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

export function budgetRulesRef(uid: string): CollectionReference<FirestoreBudgetRule> {
  return sub(uid, 'budgetRules') as CollectionReference<FirestoreBudgetRule>;
}
export function budgetRuleRef(uid: string, id: string): DocumentReference<Omit<FirestoreBudgetRule, 'id'>> {
  return subDoc(uid, 'budgetRules', id) as DocumentReference<Omit<FirestoreBudgetRule, 'id'>>;
}

export function plannedPaymentsRef(uid: string): CollectionReference<FirestorePlannedPayment> {
  return sub(uid, 'plannedPayments') as CollectionReference<FirestorePlannedPayment>;
}
export function plannedPaymentRef(uid: string, id: string): DocumentReference<Omit<FirestorePlannedPayment, 'id'>> {
  return subDoc(uid, 'plannedPayments', id) as DocumentReference<Omit<FirestorePlannedPayment, 'id'>>;
}

export function settingsRef(uid: string): DocumentReference<FirestoreSettings> {
  return subDoc(uid, 'settings', 'app') as DocumentReference<FirestoreSettings>;
}

export function budgetPlansRef(uid: string): CollectionReference<FirestoreBudgetPlan> {
  return sub(uid, 'budgetPlans') as CollectionReference<FirestoreBudgetPlan>;
}
export function budgetPlanRef(uid: string, month: string): DocumentReference<FirestoreBudgetPlan> {
  return subDoc(uid, 'budgetPlans', month) as DocumentReference<FirestoreBudgetPlan>;
}

export function exchangeRatesRef(uid: string): CollectionReference<FirestoreExchangeRate> {
  return sub(uid, 'exchangeRates') as CollectionReference<FirestoreExchangeRate>;
}
export function exchangeRateRef(uid: string, code: string): DocumentReference<Omit<FirestoreExchangeRate, 'id'>> {
  return subDoc(uid, 'exchangeRates', code) as DocumentReference<Omit<FirestoreExchangeRate, 'id'>>;
}

export function statsHomeRef(uid: string): DocumentReference<StatsHome> {
  return subDoc(uid, 'stats', 'home') as DocumentReference<StatsHome>;
}
export function statsMonthlyRef(uid: string, month: string): DocumentReference<StatsMonthly> {
  return subDoc(uid, 'statsMonthly', month) as DocumentReference<StatsMonthly>;
}
export function statsBudgetProgressRef(uid: string, month: string): DocumentReference<StatsBudgetProgress> {
  return subDoc(uid, 'statsBudgetProgress', month) as DocumentReference<StatsBudgetProgress>;
}

export function userRef(uid: string): DocumentReference<FirestoreUserDoc> {
  return doc(getFirebaseFirestore(), 'users', uid) as DocumentReference<FirestoreUserDoc>;
}

export interface PinDoc {
  pinHash: string;
  updatedAt?: Timestamp;
}
export function userPinRef(uid: string): DocumentReference<PinDoc> {
  return doc(getFirebaseFirestore(), 'users', uid, 'private', 'pin') as DocumentReference<PinDoc>;
}
